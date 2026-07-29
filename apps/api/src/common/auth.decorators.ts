import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from "@nestjs/common";
import type { Request } from "express";
import type { Role } from "../generated/prisma/client";
import type { AuthUser } from "./auth.types";

export const IS_PUBLIC_KEY = "isPublic";
export const ROLES_KEY = "roles";

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser => {
    const request = context.switchToHttp().getRequest<Request>();
    return request.user as AuthUser;
  },
);
