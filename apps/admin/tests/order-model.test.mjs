import assert from "node:assert/strict";
import test from "node:test";
import {
  canCancel,
  nextOrderStatus,
  orderStatuses,
  ratingStars,
  statusLabels,
} from "../src/entities/order/model/types.ts";
import {
  kanbanLanesForRole,
  kanbanQueueStatusesForRole,
  orderCardFieldsForRole,
  roleCanUseOrderTable,
} from "../src/entities/order/model/kanban.ts";

test("frontend order labels cover every generated workflow status", () => {
  assert.deepEqual(Object.keys(statusLabels), orderStatuses);
});

test("frontend role hints match the backend-owned workflow", () => {
  assert.equal(nextOrderStatus("OPERATOR", "NEW"), "CONFIRMED");
  assert.equal(
    nextOrderStatus("OPERATOR", "CONFIRMED"),
    "SENT_TO_KITCHEN",
  );
  assert.equal(nextOrderStatus("COOK", "SENT_TO_KITCHEN"), "COOKING");
  assert.equal(nextOrderStatus("COOK", "COOKING"), "READY");
  assert.equal(
    nextOrderStatus("COURIER", "ASSIGNED_TO_COURIER"),
    "OUT_FOR_DELIVERY",
  );
  assert.equal(nextOrderStatus("ACCOUNTANT", "COMPLETED"), "RECONCILED");
  assert.equal(nextOrderStatus("OPERATOR", "COOKING"), undefined);
});

test("frontend hides cancellation once cooking starts", () => {
  assert.equal(canCancel("OPERATOR", "SENT_TO_KITCHEN"), true);
  assert.equal(canCancel("ADMIN", "CONFIRMED"), true);
  assert.equal(canCancel("SUPER_ADMIN", "NEW"), true);
  assert.equal(canCancel("OPERATOR", "COOKING"), false);
  assert.equal(canCancel("COOK", "NEW"), false);
});

test("frontend renders a complete five-star review scale", () => {
  assert.equal(ratingStars(5), "★★★★★");
  assert.equal(ratingStars(4), "★★★★☆");
  assert.equal(ratingStars(1), "★☆☆☆☆");
});

test("full-flow staff roles see the complete order kanban", () => {
  const expected = [
    "incoming",
    "kitchen-queue",
    "cooking",
    "ready",
    "assigned",
    "delivery",
    "cash",
    "closing",
    "cancelled",
  ];

  for (const role of ["OPERATOR", "ACCOUNTANT", "ADMIN", "SUPER_ADMIN"]) {
    assert.deepEqual(
      kanbanLanesForRole(role).map((lane) => lane.id),
      expected,
      `${role} must see the whole lifecycle`,
    );
  }
});

test("cook and courier kanbans contain only their zones of responsibility", () => {
  assert.deepEqual(
    kanbanLanesForRole("COOK").map((lane) => lane.id),
    ["kitchen-queue", "cooking", "ready"],
  );
  assert.deepEqual(
    kanbanLanesForRole("COURIER").map((lane) => lane.id),
    ["assigned", "delivery", "cash"],
  );
  assert.deepEqual(kanbanLanesForRole("CUSTOMER"), []);
  assert.deepEqual(kanbanQueueStatusesForRole("COOK"), [
    "SENT_TO_KITCHEN",
    "COOKING",
    "READY",
  ]);
  assert.deepEqual(kanbanQueueStatusesForRole("COURIER"), [
    "ASSIGNED_TO_COURIER",
    "OUT_FOR_DELIVERY",
    "DELIVERED",
    "CASH_RETURNED",
  ]);
  assert.equal(kanbanQueueStatusesForRole("OPERATOR"), undefined);
});

test("order cards disclose only data needed by each staff role", () => {
  assert.deepEqual([...orderCardFieldsForRole("COOK")], ["branch", "items"]);
  assert.deepEqual([...orderCardFieldsForRole("COURIER")], [
    "customer",
    "delivery",
    "branch",
    "items",
    "cash",
  ]);
  assert.deepEqual([...orderCardFieldsForRole("ACCOUNTANT")], [
    "branch",
    "cash",
    "courier",
  ]);
  assert.equal(orderCardFieldsForRole("COOK").has("customer"), false);
  assert.equal(orderCardFieldsForRole("ACCOUNTANT").has("delivery"), false);
});

test("detailed table is limited to operational and administrative roles", () => {
  for (const role of ["OPERATOR", "ADMIN", "SUPER_ADMIN"]) {
    assert.equal(roleCanUseOrderTable(role), true, role);
  }
  for (const role of ["CUSTOMER", "COOK", "COURIER", "ACCOUNTANT"]) {
    assert.equal(roleCanUseOrderTable(role), false, role);
  }
});
