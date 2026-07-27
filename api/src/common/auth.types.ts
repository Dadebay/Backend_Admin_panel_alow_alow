import type { Role } from "../generated/prisma/client";

export type AuthUser = {
  id: string;
  phone: string;
  role: Role;
};

declare module "express-serve-static-core" {
  interface Request {
    user?: AuthUser;
  }
}
