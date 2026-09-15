import { AdminPage, Role } from "../generated/prisma/client";

export const ADMIN_PAGES = Object.values(AdminPage);

const ADMIN_DEFAULT_PAGES: AdminPage[] = [...ADMIN_PAGES];

const DEFAULT_PAGES_BY_ROLE: Partial<Record<Role, readonly AdminPage[]>> = {
  [Role.ACCOUNTANT]: [AdminPage.ACCOUNTING],
  [Role.ADMIN]: ADMIN_DEFAULT_PAGES,
  [Role.SUPER_ADMIN]: ADMIN_DEFAULT_PAGES,
};

export const CONFIGURABLE_ADMIN_PAGE_ROLES = [
  Role.ACCOUNTANT,
  Role.ADMIN,
] as const;

export function defaultAdminPages(role: Role): AdminPage[] {
  return [...(DEFAULT_PAGES_BY_ROLE[role] ?? [])];
}

export function availableAdminPages(role: Role): AdminPage[] {
  return defaultAdminPages(role);
}

export function isConfigurableAdminPageRole(
  role: Role,
): role is (typeof CONFIGURABLE_ADMIN_PAGE_ROLES)[number] {
  return CONFIGURABLE_ADMIN_PAGE_ROLES.includes(
    role as (typeof CONFIGURABLE_ADMIN_PAGE_ROLES)[number],
  );
}

export function effectiveAdminPages(
  role: Role,
  storedPages: readonly AdminPage[] | null,
): AdminPage[] {
  if (role === Role.SUPER_ADMIN) return defaultAdminPages(role);
  if (!isConfigurableAdminPageRole(role)) return [];
  if (storedPages === null) return defaultAdminPages(role);

  const available = new Set(availableAdminPages(role));
  return ADMIN_PAGES.filter(
    (page) => available.has(page) && storedPages.includes(page),
  );
}
