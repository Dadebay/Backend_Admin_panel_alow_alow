import { describe, expect, it } from "vitest";
import { AdminPage, Role } from "../src/generated/prisma/client";
import {
  ADMIN_PAGES,
  OPERATIONS_ADMIN_PAGES,
  availableAdminPages,
  defaultAdminPages,
  effectiveAdminPages,
  isConfigurableAdminPageRole,
} from "../src/users/admin-page-access.policy";

describe("admin page access policy", () => {
  it("keeps the super administrator immutable with every page", () => {
    expect(effectiveAdminPages(Role.SUPER_ADMIN, [])).toEqual(
      OPERATIONS_ADMIN_PAGES,
    );
    expect(isConfigurableAdminPageRole(Role.SUPER_ADMIN)).toBe(false);
  });

  it("defaults every employee web role to its supported working pages", () => {
    expect(defaultAdminPages(Role.ADMIN)).toEqual(OPERATIONS_ADMIN_PAGES);
    expect(defaultAdminPages(Role.OPERATOR)).toEqual([
      AdminPage.ORDERS,
      AdminPage.COURIER_MAP,
    ]);
    expect(defaultAdminPages(Role.COOK)).toEqual([AdminPage.ORDERS]);
    expect(defaultAdminPages(Role.COURIER)).toEqual([
      AdminPage.COURIER_WORKSPACE,
    ]);
    expect(defaultAdminPages(Role.ACCOUNTANT)).toEqual([
      AdminPage.ACCOUNTING,
    ]);
    expect(defaultAdminPages(Role.CUSTOMER)).toEqual([]);
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
    expect(
      effectiveAdminPages(Role.COURIER, [
        AdminPage.COURIER_WORKSPACE,
        AdminPage.ORDERS,
      ]),
    ).toEqual([AdminPage.COURIER_WORKSPACE]);
    expect(ADMIN_PAGES).toContain(AdminPage.COURIER_WORKSPACE);
  });
});
