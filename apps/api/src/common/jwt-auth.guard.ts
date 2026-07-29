import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { PrismaService } from "../prisma/prisma.service";
import { IS_PUBLIC_KEY } from "./auth.decorators";

type AccessPayload = {
  sub: string;
  role: string;
  phone: string;
};

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const [scheme, token] = String(request.headers.authorization ?? "").split(
      " ",
    );
    if (scheme !== "Bearer" || !token) {
      throw new UnauthorizedException("Bearer access token is required");
    }

    try {
      const payload = await this.jwt.verifyAsync<AccessPayload>(token);
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, phone: true, role: true, isActive: true },
      });
      if (!user?.isActive) {
        throw new UnauthorizedException("Account is inactive");
      }
      request.user = { id: user.id, phone: user.phone, role: user.role };
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException("Access token is invalid or expired");
    }
  }
}
