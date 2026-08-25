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
const printerRegistryUrl = new URL(
  "../src/widgets/catalog-manager/ui/receipt-printer-registry.tsx",
  import.meta.url,
);

test("receipt printing uses the backend plan and loopback-only agent", async () => {
  const source = await readFile(printingFeatureUrl, "utf8");

  assert.match(source, /http:\/\/127\.0\.0\.1:17873/);
  assert.match(source, /\/orders\/\$\{orderId\}\/receipt-print-plan/);
  assert.match(source, /\/v1\/print/);
  assert.match(source, /crypto\.randomUUID\(\)/);
  assert.match(source, /documentType: plan\.documentType/);
  assert.match(source, /cancellationReason: plan\.cancellationReason/);
  assert.match(source, /plan\.mainJob \? \[plan\.mainJob\] : \[\]/);
  assert.match(source, /\.\.\.plan\.jobs/);
  assert.match(source, /retry: false/);
});

test("cooking orders automatically print and later statuses can reprint", async () => {
  const [board, kanban, alert] = await Promise.all([
    readFile(boardUrl, "utf8"),
    readFile(kanbanUrl, "utf8"),
    readFile(alertUrl, "utf8"),
  ]);

  assert.match(alert, /statuses: \["COOKING", "READY"\]/);
  assert.match(alert, /printReceipt\(order\.id\)/);
  assert.match(board, /data-testid=\{`order-table-print-\$\{order\.id\}`\}/);
  assert.match(board, /Печать не выполнена:/);
  assert.match(kanban, /data-testid=\{`order-kanban-print-\$\{order\.id\}`\}/);
  assert.match(kanban, /onPrintReceipt\(order\)/);
});

test("a successful cancellation prints its cancellation receipt and allows retry", async () => {
  const [board, kanban] = await Promise.all([
    readFile(boardUrl, "utf8"),
    readFile(kanbanUrl, "utf8"),
  ]);

  assert.match(
    board,
    /actions\.cancel\.mutate\([\s\S]*?onSuccess: \(cancelledOrder\) => \{[\s\S]*?receiptPrinting\.mutate\(cancelledOrder\.id\)/,
  );
  assert.doesNotMatch(board, /order\.status !== "CANCELLED"/);
  assert.doesNotMatch(kanban, /order\.status !== "CANCELLED"/);
});

test("catalog manages printer endpoints and assigns them by ID", async () => {
  const [routes, catalogManager, productRoute, registry] = await Promise.all([
    readFile(categoryRoutesUrl, "utf8"),
    readFile(catalogManagerUrl, "utf8"),
    readFile(productRouteUrl, "utf8"),
    readFile(printerRegistryUrl, "utf8"),
  ]);

  assert.match(routes, /data-testid="category-printer-routes"/);
  assert.match(routes, /category-printer-select-\$\{category\.id\}/);
  assert.match(routes, /category-printer-save-\$\{category\.id\}/);
  assert.match(routes, /category-printer-clear-\$\{category\.id\}/);
  assert.match(routes, /category-delete-open-\$\{category\.id\}/);
  assert.match(routes, /category-visibility-\$\{category\.id\}/);
  assert.match(routes, /Скрыть категорию/);
  assert.match(routes, /Показать категорию/);
  assert.match(routes, /не дублируется/);
  assert.match(catalogManager, /<CategoryReceiptRoutes/);
  assert.match(catalogManager, /buildCategoryPrinterUpdate/);
  assert.match(catalogManager, /buildCategoryVisibilityUpdate/);
  assert.match(catalogManager, /полностью заменяет аппарат/);
  assert.match(catalogManager, /data-testid="main-receipt-printer-clear"/);
  assert.match(catalogManager, /data-testid="main-receipt-printer-select"/);
  assert.match(catalogManager, /<ReceiptPrinterRegistry/);
  assert.match(catalogManager, /<ProductReceiptRoute/);
  assert.match(productRoute, /product-printer-select-\$\{product\.id\}/);
  assert.match(productRoute, /product-printer-clear-\$\{product\.id\}/);
  assert.match(productRoute, /Наследовать категорию/);
  assert.match(productRoute, /Свой аппарат: категория не используется/);
  assert.match(registry, /data-testid="receipt-printer-form"/);
  assert.match(registry, /RAW TCP \/ ESC-POS/);
  assert.match(registry, /JSPEED_HTTP/);
  assert.match(registry, /Подтвердить удаление/);
});
