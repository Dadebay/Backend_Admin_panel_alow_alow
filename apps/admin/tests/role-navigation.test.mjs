import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { canAccessAdminPortal } from "../src/shared/auth/model/admin-portal-access.ts";
import { navigationForRole } from "../src/widgets/admin-dashboard/model/admin-navigation.ts";

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

test("accountant navigation contains the lifecycle board and cash control", () => {
  assert.deepEqual(views("ACCOUNTANT"), ["orders", "cash"]);
});

test("administrators retain all management sections represented outside the full-flow board", () => {
  const expected = [
    "login-attempts",
    "orders",
    "map",
    "branches",
    "catalog",
    "marketing",
    "notifications",
    "staff",
    "cash",
    "contacts",
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
  assert.match(source, /!canAccessAdminPortal\(session\.user\.role\)/);
});

test("the web courier route is absent and OTP sessions enforce portal roles", async () => {
  const [appSource, sessionSource] = await Promise.all([
    readFile(new URL("../src/app/ui/app.tsx", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../src/shared/auth/model/session-provider.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

  assert.doesNotMatch(appSource, /normalizedPath === "\/courier"/);
  assert.match(sessionSource, /!canAccessAdminPortal\(response\.user\.role\)/);
  assert.match(sessionSource, /Доступ к админке разрешён только/);
});
