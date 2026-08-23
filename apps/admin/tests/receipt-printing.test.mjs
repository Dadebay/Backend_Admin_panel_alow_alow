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
const categoryRoutesUrl = new URL(
  "../src/widgets/catalog-manager/ui/category-receipt-routes.tsx",
  import.meta.url,
);
const catalogManagerUrl = new URL(
  "../src/widgets/catalog-manager/ui/catalog-manager.tsx",
  import.meta.url,
);
const productRouteUrl = new URL(
  "../src/widgets/catalog-manager/ui/product-receipt-route.tsx",
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

test("catalog exposes direct printer IP assignment and clearing", async () => {
  const [routes, catalogManager, productRoute] = await Promise.all([
    readFile(categoryRoutesUrl, "utf8"),
    readFile(catalogManagerUrl, "utf8"),
    readFile(productRouteUrl, "utf8"),
  ]);

  assert.match(routes, /data-testid="category-printer-routes"/);
  assert.match(routes, /category-printer-ip-\$\{category\.id\}/);
  assert.match(routes, /category-printer-save-\$\{category\.id\}/);
  assert.match(routes, /category-printer-clear-\$\{category\.id\}/);
  assert.match(routes, /category-delete-open-\$\{category\.id\}/);
  assert.match(routes, /category-visibility-\$\{category\.id\}/);
  assert.match(routes, /Скрыть категорию/);
  assert.match(routes, /Показать категорию/);
  assert.match(routes, /не дублируется на принтер категории/);
  assert.match(catalogManager, /<CategoryReceiptRoutes/);
  assert.match(catalogManager, /buildCategoryPrinterUpdate/);
  assert.match(catalogManager, /buildCategoryVisibilityUpdate/);
  assert.match(catalogManager, /полностью заменяет аппарат/);
  assert.match(catalogManager, /data-testid="main-receipt-printer-clear"/);
  assert.match(catalogManager, /<ProductReceiptRoute/);
  assert.match(productRoute, /product-printer-ip-\$\{product\.id\}/);
  assert.match(productRoute, /product-printer-clear-\$\{product\.id\}/);
  assert.match(productRoute, /Убрать свой IP/);
  assert.match(productRoute, /Свой IP: категория не используется/);
});
