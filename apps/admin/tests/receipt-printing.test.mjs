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

test("printing enters the durable queue and notification observation never prints", async () => {
  const [feature,board,kanban,alert] = await Promise.all([printingFeatureUrl,boardUrl,kanbanUrl,alertUrl].map(url=>readFile(url,"utf8")));
  assert.match(feature, /receipt-print-tasks\/orders/);
  assert.match(feature, /idempotencyKey:\s*key/);
  assert.doesNotMatch(feature, /receipt-print-plan/);
  assert.doesNotMatch(alert, /claimAutomaticReceiptPrint|printReceipt|useReceiptPrinting/);
  assert.doesNotMatch(board, /receiptPrinting\.mutate\(cancelledOrder\.id\)/);
  assert.match(board, /Чек добавлен в очередь/);
  assert.match(board, /data-testid=\{`order-table-print-\$\{order\.id\}`\}/);
  assert.match(kanban, /data-testid=\{`order-kanban-print-\$\{order\.id\}`\}/);
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
