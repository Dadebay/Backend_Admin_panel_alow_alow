import type { components } from "@alowalow/api-contract";

type SessionUser = components["schemas"]["AuthSessionUserDto"];
export type AdminPortalRole = SessionUser["role"];

const ADMIN_PORTAL_ROLES = new Set<AdminPortalRole>([
  "ACCOUNTANT",
  "ADMIN",
  "SUPER_ADMIN",
]);

export function canAccessAdminPortal(role: AdminPortalRole) {
  return ADMIN_PORTAL_ROLES.has(role);
}
