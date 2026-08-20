import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { matchRoutes } from "react-router";
import {
  adminNavigation,
  defaultAdminPathForRole,
} from "../src/widgets/admin-dashboard/model/admin-navigation.ts";

const expectedPaths = {
  "login-attempts": "/login-attempts",
  orders: "/orders",
  map: "/couriers/map",
  branches: "/branches",
  catalog: "/catalog",
  marketing: "/marketing",
  notifications: "/notifications",
  staff: "/staff",
  cash: "/cash",
  contacts: "/contacts",
};

const routeTree = [
  {
    children: adminNavigation.map(({ id, path }) => ({
      id,
      path,
    })),
  },
];

test("every admin section owns a unique canonical browser URL", () => {
  assert.deepEqual(
    Object.fromEntries(adminNavigation.map(({ id, path }) => [id, path])),
    expectedPaths,
  );
  assert.equal(
    new Set(adminNavigation.map(({ path }) => path)).size,
    adminNavigation.length,
  );

  for (const { id, path } of adminNavigation) {
    const matches = matchRoutes(routeTree, path);
    assert.equal(matches?.at(-1)?.route.id, id, path);
  }
});

test("every portal role returns to orders when a section is forbidden", () => {
  for (const role of ["ACCOUNTANT", "ADMIN", "SUPER_ADMIN"]) {
    assert.equal(defaultAdminPathForRole(role), "/orders", role);
  }
});

test("the SPA uses history routing, role guards and a nested admin layout", async () => {
  const [appSource, dashboardSource, nginxSource] = await Promise.all([
    readFile(new URL("../src/app/ui/app.tsx", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../src/widgets/admin-dashboard/ui/admin-dashboard.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(new URL("../nginx.conf", import.meta.url), "utf8"),
  ]);

  assert.match(appSource, /<BrowserRouter>/);
  assert.match(appSource, /<Routes>/);
  assert.match(appSource, /adminNavigation\.map/);
  assert.match(appSource, /navigationItem\.roles\.includes\(session\.user\.role\)/);
  assert.match(appSource, /<Navigate[\s\S]*?to="\/orders"/);
  assert.match(appSource, /<Route path="\*" element=\{<NotFound \/>\}/);
  assert.match(dashboardSource, /<NavLink/);
  assert.match(dashboardSource, /<Outlet \/>/);
  assert.match(nginxSource, /try_files \$uri \$uri\/ \/index\.html;/);
});
