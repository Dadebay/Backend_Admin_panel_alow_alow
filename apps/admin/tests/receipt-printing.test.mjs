import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const printingFeatureUrl = new URL(
  "../src/features/receipt-printing/api/use-receipt-printing.ts",
  import.meta.url,
);
const boardUrl = new URL(
  "../src/widgets/order-board/ui/order-board.tsx",
  import.meta.url,
);
const kanbanUrl = new URL(
  "../src/widgets/order-board/ui/order-kanban.tsx",
  import.meta.url,
);
const alertUrl = new URL(
  "../src/features/new-order-alert/ui/new-order-alert.tsx",
  import.meta.url,
);

test("receipt printing uses the backend plan and loopback-only agent", async () => {
  const source = await readFile(printingFeatureUrl, "utf8");

  assert.match(source, /http:\/\/127\.0\.0\.1:17873/);
  assert.match(source, /\/orders\/\$\{orderId\}\/receipt-print-plan/);
  assert.match(source, /\/v1\/print/);
  assert.match(source, /crypto\.randomUUID\(\)/);
  assert.match(source, /plan\.mainJob \? \[plan\.mainJob\] : \[\]/);
  assert.match(source, /\.\.\.plan\.jobs/);
  assert.match(source, /retry: false/);
});

test("new kitchen orders automatically print and later statuses can reprint", async () => {
  const [board, kanban, alert] = await Promise.all([
    readFile(boardUrl, "utf8"),
    readFile(kanbanUrl, "utf8"),
    readFile(alertUrl, "utf8"),
  ]);

  assert.doesNotMatch(board, /nextStatus === "CONFIRMED"/);
  assert.match(alert, /statuses: \["SENT_TO_KITCHEN", "COOKING", "READY"\]/);
  assert.match(alert, /printReceipt\(order\.id\)/);
  assert.match(board, /data-testid=\{`order-table-print-\$\{order\.id\}`\}/);
  assert.match(board, /Печать не выполнена:/);
  assert.match(kanban, /data-testid=\{`order-kanban-print-\$\{order\.id\}`\}/);
  assert.match(kanban, /onPrintReceipt\(order\)/);
});
