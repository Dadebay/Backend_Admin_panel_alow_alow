import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import { randomInt, randomUUID, randomBytes } from "node:crypto";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { PrismaService } from "../prisma/prisma.service";
import { Prisma } from "../generated/prisma/client";
import type { AppEnv } from "../config/env";
import { RequestOtpDto, VerifyOtpDto } from "./auth.dto";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  normalizePhone(value: string) {
    const parsed = parsePhoneNumberFromString(value, "TM");
    if (!parsed?.isValid()) {
      throw new BadRequestException("Phone number is invalid");
    }
    return parsed.number;
  }

  async requestOtp(dto: RequestOtpDto, requestedIp?: string) {
    const phone = this.normalizePhone(dto.phone);
    const code = String(randomInt(100_000, 1_000_000));
    const codeHash = await argon2.hash(
      `${code}:${this.config.get("OTP_PEPPER", { infer: true })}`,
    );

    await this.prisma.$transaction([
      this.prisma.phoneOtp.updateMany({
        where: { phone, consumedAt: null },
        data: { consumedAt: new Date() },
      }),
      this.prisma.phoneOtp.create({
        data: {
          phone,
          codeHash,
          requestedIp,
          expiresAt: new Date(Date.now() + 5 * 60_000),
        },
      }),
    ]);

    return {
      expiresInSeconds: 300,
      ...(this.config.get("NODE_ENV", { infer: true }) === "development"
        ? { devCode: code }
        : {}),
    };
  }

  async verifyOtp(dto: VerifyOtpDto) {
    const phone = this.normalizePhone(dto.phone);
    const otp = await this.prisma.phoneOtp.findFirst({
      where: { phone, consumedAt: null },
      orderBy: { createdAt: "desc" },
    });
    if (!otp || otp.expiresAt < new Date() || otp.attempts >= 5) {
      throw new UnauthorizedException("Code is expired or unavailable");
    }

    const valid = await this.verifyHash(
      otp.codeHash,
      `${dto.code}:${this.config.get("OTP_PEPPER", { infer: true })}`,
    );
    if (!valid) {
      await this.prisma.phoneOtp.update({
        where: { id: otp.id },
        data: { attempts: { increment: 1 } },
      });
      throw new UnauthorizedException("Code is incorrect");
    }

    const user = await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.phoneOtp.updateMany({
        where: {
          id: otp.id,
          consumedAt: null,
          attempts: { lt: 5 },
          expiresAt: { gt: new Date() },
        },
        data: { consumedAt: new Date() },
      });
      if (consumed.count !== 1) {
        throw new UnauthorizedException("Code is expired or unavailable");
      }
      return tx.user.upsert({
        where: { phone },
        create: {
          phone,
          firstName: dto.firstName,
          lastName: dto.lastName,
        },
        update: {
          ...(dto.firstName ? { firstName: dto.firstName } : {}),
          ...(dto.lastName ? { lastName: dto.lastName } : {}),
        },
      });
    });

    return this.issueSession(user);
  }

  async refresh(rawToken: string) {
    const [tokenId, secret] = rawToken.split(".");
    if (!tokenId || !secret) {
      throw new UnauthorizedException("Refresh token is invalid");
    }
    const stored = await this.prisma.refreshToken.findUnique({
      where: { id: tokenId },
      include: { user: true },
    });
    if (
      !stored ||
      stored.revokedAt ||
      stored.expiresAt < new Date() ||
      !stored.user.isActive ||
      !(await this.verifyHash(stored.secretHash, secret))
    ) {
      throw new UnauthorizedException("Refresh token is invalid or expired");
    }

    return this.prisma.$transaction(async (tx) => {
      const revoked = await tx.refreshToken.updateMany({
        where: {
          id: stored.id,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { revokedAt: new Date() },
      });
      if (revoked.count !== 1) {
        throw new UnauthorizedException("Refresh token is invalid or expired");
      }
      return this.issueSession(stored.user, tx);
    });
  }

  async logout(rawToken: string) {
    const [tokenId, secret, extra] = rawToken.split(".");
    if (tokenId && secret && !extra) {
      const stored = await this.prisma.refreshToken.findUnique({
        where: { id: tokenId },
        select: { secretHash: true, revokedAt: true },
      });
      if (
        stored &&
        !stored.revokedAt &&
        (await this.verifyHash(stored.secretHash, secret))
      ) {
        await this.prisma.refreshToken.updateMany({
          where: { id: tokenId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
    }
    return { success: true };
  }

  private async issueSession(
    user: {
      id: string;
      phone: string;
      role: string;
      firstName: string | null;
      lastName: string | null;
    },
    store: PrismaService | Prisma.TransactionClient = this.prisma,
  ) {
    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      phone: user.phone,
      role: user.role,
    });
    const id = randomUUID();
    const secret = randomBytes(48).toString("base64url");
    const refreshToken = `${id}.${secret}`;
    const days = this.config.get("REFRESH_TOKEN_TTL_DAYS", { infer: true });
    await store.refreshToken.create({
      data: {
        id,
        userId: user.id,
        secretHash: await argon2.hash(secret),
        expiresAt: new Date(Date.now() + days * 86_400_000),
      },
    });

    return {
      accessToken,
      refreshToken,
      expiresInSeconds: 900,
      user: {
        id: user.id,
        phone: user.phone,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    };
  }

  private async verifyHash(hash: string, value: string) {
    try {
      return await argon2.verify(hash, value);
    } catch {
      return false;
    }
  }
}
