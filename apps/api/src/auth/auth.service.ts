import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import { randomUUID, randomBytes } from "node:crypto";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { PrismaService } from "../prisma/prisma.service";
import { Prisma } from "../generated/prisma/client";
import type { AppEnv } from "../config/env";
import { RequestOtpDto, VerifyOtpDto } from "./auth.dto";
import { OtpService } from "./otp.service";
import { SmsService } from "./sms.service";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<AppEnv, true>,
    private readonly otp: OtpService,
    private readonly sms: SmsService,
  ) {}

  normalizePhone(value: string) {
    const parsed = parsePhoneNumberFromString(value, "TM");
    if (!parsed?.isValid()) {
      throw new BadRequestException("Phone number is invalid");
    }
    return parsed.number;
  }

  async requestOtp(dto: RequestOtpDto) {
    const phone = this.normalizePhone(dto.phone);
    const challenge = await this.otp.issue(phone);
    try {
      await this.sms.sendOtp(
        phone,
        challenge.code,
        challenge.requestId,
        challenge.expiresInSeconds,
      );
    } catch {
      await this.otp.cancel(phone, challenge.requestId);
      throw new ServiceUnavailableException(
        "The verification code could not be sent",
      );
    }

    return {
      expiresInSeconds: challenge.expiresInSeconds,
      ...(this.config.get("NODE_ENV", { infer: true }) === "development"
        ? { devCode: challenge.code }
        : {}),
    };
  }

  async verifyOtp(dto: VerifyOtpDto) {
    const phone = this.normalizePhone(dto.phone);
    const verification = await this.otp.verify(phone, dto.code);
    if (verification === "unavailable") {
      throw new UnauthorizedException("Code is expired or unavailable");
    }
    if (verification === "incorrect") {
      throw new UnauthorizedException("Code is incorrect");
    }

    const user = await this.prisma.user.upsert({
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
