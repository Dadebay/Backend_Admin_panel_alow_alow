import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { navigationForRole } from "../src/widgets/admin-dashboard/model/admin-navigation.ts";

function views(role) {
  return navigationForRole(role).map((item) => item.id);
}

test("operator navigation is limited to order intake, dispatch, and cash", () => {
  assert.deepEqual(views("OPERATOR"), ["orders", "map", "cash"]);
});

test("cook navigation opens only the kitchen workspace", () => {
  assert.deepEqual(views("COOK"), ["kitchen"]);
});

test("accountant navigation contains the lifecycle board and cash control", () => {
  assert.deepEqual(views("ACCOUNTANT"), ["orders", "cash"]);
});

test("couriers and customers do not receive admin navigation", () => {
  assert.deepEqual(views("COURIER"), []);
  assert.deepEqual(views("CUSTOMER"), []);
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
  assert.match(source, /session\.user\.role === "COURIER"/);
});
