import { describe, expect, it } from "vitest";
import { AdminPage, Role } from "../src/generated/prisma/client";
import {
  ADMIN_PAGES,
  availableAdminPages,
  defaultAdminPages,
  effectiveAdminPages,
  isConfigurableAdminPageRole,
} from "../src/users/admin-page-access.policy";

describe("admin page access policy", () => {
  it("keeps the super administrator immutable with every page", () => {
    expect(effectiveAdminPages(Role.SUPER_ADMIN, [])).toEqual(ADMIN_PAGES);
    expect(isConfigurableAdminPageRole(Role.SUPER_ADMIN)).toBe(false);
  });

  it("defaults administrators and accountants to their current safe access", () => {
    expect(defaultAdminPages(Role.ADMIN)).toEqual(ADMIN_PAGES);
    expect(defaultAdminPages(Role.ACCOUNTANT)).toEqual([
      AdminPage.ACCOUNTING,
    ]);
    expect(defaultAdminPages(Role.COURIER)).toEqual([]);
  });

  it("allows stored policies to narrow but never expand a role ceiling", () => {
    expect(
      effectiveAdminPages(Role.ADMIN, [
        AdminPage.ORDERS,
        AdminPage.CATALOG,
      ]),
    ).toEqual([AdminPage.ORDERS, AdminPage.CATALOG]);
    expect(
      effectiveAdminPages(Role.ACCOUNTANT, [
        AdminPage.ACCOUNTING,
        AdminPage.ORDERS,
      ]),
    ).toEqual([AdminPage.ACCOUNTING]);
    expect(availableAdminPages(Role.ACCOUNTANT)).toEqual([
      AdminPage.ACCOUNTING,
    ]);
  });
});
