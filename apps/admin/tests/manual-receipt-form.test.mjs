import assert from "node:assert/strict";
import test from "node:test";
import {
  manualReceiptFormSchema,
  manualReceiptItemRoutes,
} from "../src/features/receipt-printing/model/manual-receipt-form.ts";

const first = "11111111-1111-4111-8111-111111111111";
const second = "22222222-2222-4222-8222-222222222222";
const printer = "33333333-3333-4333-8333-333333333333";

test("manual print requires at least one included dish", () => {
  assert.equal(manualReceiptFormSchema.safeParse({
    routes: [{ itemId: first, destination: "SKIP" }],
  }).success, false);
});

test("manual print sends explicit omissions and printer overrides", () => {
  const values = manualReceiptFormSchema.parse({
    routes: [
      { itemId: first, destination: "SKIP" },
      { itemId: second, destination: printer },
    ],
  });
  assert.deepEqual(manualReceiptItemRoutes(values), [
    { itemId: first, printerId: null, skip: true },
    { itemId: second, printerId: printer },
  ]);
});

test("default routes are omitted and main-only routes stay explicit", () => {
  const values = manualReceiptFormSchema.parse({
    routes: [
      { itemId: first, destination: "DEFAULT" },
      { itemId: second, destination: "MAIN" },
    ],
  });
  assert.deepEqual(manualReceiptItemRoutes(values), [
    { itemId: second, printerId: null },
  ]);
  assert.equal(manualReceiptFormSchema.safeParse({
    routes: [{ itemId: first, destination: "not-a-printer" }],
  }).success, false);
});
