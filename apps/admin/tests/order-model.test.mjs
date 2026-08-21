import assert from "node:assert/strict";
import test from "node:test";
import {
  canCancel,
  canAdministratorEditOrder,
  canEditCourierAssignment,
  nextOrderStatus,
  previousOrderStatus,
  orderStatuses,
  ratingStars,
  statusLabels,
} from "../src/entities/order/model/types.ts";
import {
  kanbanLanesForRole,
  kanbanQueueStatusesForRole,
  orderKanbanLanes,
  orderCardFieldsForRole,
  roleCanUseOrderTable,
} from "../src/entities/order/model/kanban.ts";

test("frontend order labels cover every generated workflow status", () => {
  assert.deepEqual(Object.keys(statusLabels), orderStatuses);
  assert.equal(statusLabels.OUT_FOR_DELIVERY, "Доставляется");
  assert.ok(
    orderKanbanLanes.some(
      (lane) =>
        lane.id === "courier" &&
        lane.title === "Курьер" &&
        lane.statuses.includes("OUT_FOR_DELIVERY"),
    ),
  );
});

test("frontend role hints match the backend-owned workflow", () => {
  assert.equal(nextOrderStatus("OPERATOR", "NEW"), "CONFIRMED");
  assert.equal(nextOrderStatus("OPERATOR", "CONFIRMED"), "SENT_TO_KITCHEN");
  assert.equal(nextOrderStatus("COOK", "SENT_TO_KITCHEN"), "READY");
  assert.equal(nextOrderStatus("ADMIN", "SENT_TO_KITCHEN"), "READY");
  assert.equal(nextOrderStatus("COOK", "COOKING"), "READY");
  assert.equal(
    nextOrderStatus("COURIER", "ASSIGNED_TO_COURIER"),
    "OUT_FOR_DELIVERY",
  );
  assert.equal(nextOrderStatus("ACCOUNTANT", "COMPLETED"), "RECONCILED");
  assert.equal(nextOrderStatus("OPERATOR", "COOKING"), undefined);
});

test("frontend keeps operators early-only and gives administrators audited corrections", () => {
  assert.equal(canCancel("OPERATOR", "SENT_TO_KITCHEN"), true);
  assert.equal(canCancel("ADMIN", "CONFIRMED"), true);
  assert.equal(canCancel("SUPER_ADMIN", "NEW"), true);
  assert.equal(canCancel("OPERATOR", "COOKING"), false);
  assert.equal(canCancel("ADMIN", "COOKING"), true);
  assert.equal(canCancel("ADMIN", "DELIVERED"), true);
  assert.equal(canCancel("ADMIN", "CASH_RETURNED"), false);
  assert.equal(canCancel("COOK", "NEW"), false);
  assert.equal(previousOrderStatus("OPERATOR", "COOKING"), undefined);
  assert.equal(previousOrderStatus("ADMIN", "COOKING"), "SENT_TO_KITCHEN");
  assert.equal(
    previousOrderStatus("ADMIN", "ASSIGNED_TO_COURIER"),
    "READY",
  );
  assert.equal(previousOrderStatus("ADMIN", "OUT_FOR_DELIVERY"), undefined);
  assert.equal(previousOrderStatus("SUPER_ADMIN", "DELIVERED"), undefined);
  assert.equal(canAdministratorEditOrder("ADMIN", "READY"), true);
  assert.equal(canAdministratorEditOrder("ADMIN", "OUT_FOR_DELIVERY"), false);
});

test("frontend exposes courier correction only to dispatch roles before departure", () => {
  assert.equal(
    canEditCourierAssignment("OPERATOR", "ASSIGNED_TO_COURIER"),
    true,
  );
  assert.equal(canEditCourierAssignment("ADMIN", "ASSIGNED_TO_COURIER"), true);
  assert.equal(
    canEditCourierAssignment("SUPER_ADMIN", "ASSIGNED_TO_COURIER"),
    true,
  );
  assert.equal(
    canEditCourierAssignment("COURIER", "ASSIGNED_TO_COURIER"),
    false,
  );
  assert.equal(canEditCourierAssignment("OPERATOR", "OUT_FOR_DELIVERY"), false);
});

test("frontend renders a complete five-star review scale", () => {
  assert.equal(ratingStars(5), "★★★★★");
  assert.equal(ratingStars(4), "★★★★☆");
  assert.equal(ratingStars(1), "★☆☆☆☆");
});

test("full-flow staff roles see the complete order kanban", () => {
  const expected = ["kitchen", "ready", "courier", "archive"];

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
    ["kitchen", "ready"],
  );
  assert.deepEqual(
    kanbanLanesForRole("COURIER").map((lane) => lane.id),
    ["courier"],
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

test("full-flow kanban has three active columns and one collapsed archive", () => {
  const lanes = kanbanLanesForRole("ADMIN");
  assert.deepEqual(
    lanes.filter((lane) => !lane.collapsed).map((lane) => lane.id),
    ["kitchen", "ready", "courier"],
  );
  assert.deepEqual(lanes.find((lane) => lane.collapsed)?.statuses, [
    "COMPLETED",
    "RECONCILED",
    "CANCELLED",
  ]);
  assert.deepEqual(
    [...new Set(lanes.flatMap((lane) => lane.statuses))].sort(),
    [...orderStatuses].sort(),
  );
});

test("order cards disclose only data needed by each staff role", () => {
  assert.deepEqual([...orderCardFieldsForRole("COOK")], ["branch", "items"]);
  assert.deepEqual(
    [...orderCardFieldsForRole("COURIER")],
    ["customer", "delivery", "branch", "items", "cash"],
  );
  assert.deepEqual(
    [...orderCardFieldsForRole("ACCOUNTANT")],
    ["branch", "cash", "courier"],
  );
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
