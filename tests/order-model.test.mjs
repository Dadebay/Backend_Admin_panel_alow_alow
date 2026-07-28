import assert from "node:assert/strict";
import test from "node:test";
import {
  canCancel,
  nextOrderStatus,
  orderStatuses,
  statusLabels,
} from "../src/entities/order/model/types.ts";

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
