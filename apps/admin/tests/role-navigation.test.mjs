import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  canAccessAdminPortal,
  canAccessWebSession,
} from "../src/shared/auth/model/admin-portal-access.ts";
import {
  adminNavigation,
  navigationForRole,
} from "../src/widgets/admin-dashboard/model/admin-navigation.ts";

function views(role) {
  return navigationForRole(role).map((item) => item.id);
}

test("only accountants and administrators may enter the admin portal", () => {
  for (const role of ["ACCOUNTANT", "ADMIN", "SUPER_ADMIN"]) {
    assert.equal(canAccessAdminPortal(role), true, role);
  }
  for (const role of ["CUSTOMER", "OPERATOR", "COOK", "COURIER"]) {
    assert.equal(canAccessAdminPortal(role), false, role);
    assert.deepEqual(views(role), [], role);
  }
});

test("couriers may keep a dedicated web session without entering the admin portal", () => {
  for (const role of ["ACCOUNTANT", "ADMIN", "SUPER_ADMIN", "COURIER"]) {
    assert.equal(canAccessWebSession(role), true, role);
  }
  for (const role of ["CUSTOMER", "OPERATOR", "COOK"]) {
    assert.equal(canAccessWebSession(role), false, role);
  }
  assert.equal(canAccessAdminPortal("COURIER"), false);
});

test("accountant navigation contains only shift accounting", () => {
  assert.deepEqual(views("ACCOUNTANT"), ["accounting"]);
});

test("administrators retain all management sections represented outside the full-flow board", () => {
  const expected = [
    "login-attempts",
    "orders",
    "meal-config",
    "accounting",
    "map",
    "branches",
    "delivery",
    "catalog",
    "marketing",
    "notifications",
    "staff",
    "contacts",
    "app-versions",
  ];

  assert.deepEqual(views("ADMIN"), expected);
  assert.deepEqual(views("SUPER_ADMIN"), expected);
});

test("dashboard renders navigation from the tested role matrix", async () => {
  const source = await readFile(
    new URL(
      "../src/widgets/admin-dashboard/ui/admin-dashboard.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(source, /navigationForRole\(session\.user\.role\)/);
  assert.match(source, /visibleNav\.map/);
  assert.match(source, /<NavLink/);
  assert.match(source, /to=\{item\.path\}/);
  assert.match(source, /<Outlet \/>/);
  assert.doesNotMatch(source, /setView\(/);
  assert.match(source, /!canAccessAdminPortal\(session\.user\.role\)/);
});

test("the courier screen is isolated from admin navigation and accepts courier sessions", async () => {
  const [appSource, sessionSource, dashboardSource] = await Promise.all([
    readFile(new URL("../src/app/ui/app.tsx", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../src/shared/auth/model/session-provider.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../src/widgets/admin-dashboard/ui/admin-dashboard.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

  assert.equal(
    adminNavigation.some(({ path }) => path === "/courier"),
    false,
  );
  assert.match(appSource, /path="\/courier"/);
  assert.match(appSource, /CourierTrackingScreen/);
  assert.match(
    appSource,
    /defaultAdminPathForRole\(session\.user\.role\)/,
  );
  assert.match(sessionSource, /!canAccessWebSession\(response\.user\.role\)/);
  assert.match(sessionSource, /Веб-доступ разрешён/);
  assert.match(dashboardSource, /!canAccessAdminPortal\(session\.user\.role\)/);
  assert.match(dashboardSource, /data-testid="admin-open-courier-screen"/);
});
