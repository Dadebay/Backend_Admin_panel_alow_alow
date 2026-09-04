import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  canReceiveNewOrderAlerts,
  collectNewItems,
} from "../src/features/new-order-alert/model/new-order-alert.ts";

test("new-order alerts establish a quiet baseline and announce unseen IDs once", () => {
  const current = [{ id: "order-1" }, { id: "order-2" }];

  assert.deepEqual(collectNewItems(null, current), []);
  assert.deepEqual(collectNewItems(new Set(["order-1"]), current), [
    { id: "order-2" },
  ]);
  assert.deepEqual(
    collectNewItems(new Set(current.map((item) => item.id)), current),
    [],
  );
});

test("only order intake roles receive new-order alerts", () => {
  for (const role of ["OPERATOR", "ADMIN", "SUPER_ADMIN"]) {
    assert.equal(canReceiveNewOrderAlerts(role), true, role);
  }
  for (const role of ["CUSTOMER", "COOK", "COURIER", "ACCOUNTANT"]) {
    assert.equal(canReceiveNewOrderAlerts(role), false, role);
  }
});


test("the alert uses one visible-tab 30-second order poll and browser opt-in", async () => {
  const [querySource, alertSource, dashboardSource] = await Promise.all([
    readFile(
      new URL("../src/entities/order/api/order-queries.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../src/features/new-order-alert/ui/new-order-alert.tsx",
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

  assert.match(querySource, /ORDER_POLL_INTERVAL_MS = 30_000/);
  assert.match(querySource, /document\.visibilityState === "visible"/);
  assert.match(querySource, /refetchIntervalInBackground: false/);
  assert.match(alertSource, /statuses: \["COOKING", "READY"\]/);
  assert.doesNotMatch(alertSource, /claimAutomaticReceiptPrint/);
  assert.doesNotMatch(alertSource, /printReceipt\(order\.id\)/);
  assert.match(alertSource, /Notification\.requestPermission\(\)/);
  assert.match(alertSource, /data-testid="new-order-alert-toast"/);
  assert.match(alertSource, /data-testid="new-order-alert-open"/);
  assert.match(
    dashboardSource,
    /canReceiveNewOrderAlerts\(session\.user\.role\)/,
  );
});
