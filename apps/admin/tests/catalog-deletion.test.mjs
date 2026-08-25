import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const actionsUrl = new URL(
  "../src/features/catalog-management/api/use-catalog-actions.ts",
  import.meta.url,
);
const managerUrl = new URL(
  "../src/widgets/catalog-manager/ui/catalog-manager.tsx",
  import.meta.url,
);

test("catalog deletion uses authenticated DELETE endpoints and refreshes catalog data", async () => {
  const actions = await readFile(actionsUrl, "utf8");

  assert.match(actions, /const deleteCategory = useMutation/);
  assert.match(actions, /`\/catalog\/categories\/\$\{id\}`/);
  assert.match(actions, /const deleteProduct = useMutation/);
  assert.match(actions, /`\/catalog\/products\/\$\{id\}`/);
  assert.match(actions, /const deleteReceiptPrinter = useMutation/);
  assert.match(actions, /`\/catalog\/receipt-printers\/\$\{id\}`/);
  assert.equal(actions.match(/method: "DELETE"/g)?.length, 3);
  assert.equal(actions.match(/onSuccess: refresh/g)?.length, 10);
  assert.match(actions, /deleteCategory,/);
  assert.match(actions, /deleteProduct,/);
  assert.match(actions, /deleteReceiptPrinter,/);
});

test("catalog records require an explicit accessible deletion confirmation", async () => {
  const manager = await readFile(managerUrl, "utf8");

  assert.match(manager, /\[catalogDelete, setCatalogDelete\]/);
  assert.match(manager, /category-delete-table-open-\$\{row\.original\.id\}/);
  assert.match(manager, /product-delete-open-\$\{row\.original\.id\}/);
  assert.match(manager, /data-testid="catalog-delete-dialog"/);
  assert.match(manager, /role="alertdialog"/);
  assert.match(manager, /aria-modal="true"/);
  assert.match(manager, /data-testid="catalog-delete-cancel"/);
  assert.match(manager, /data-testid="catalog-delete-confirm"/);
  assert.match(manager, /deleteCategory\.isPending/);
  assert.match(manager, /deleteProduct\.isPending/);
  assert.match(manager, /await actions\.deleteCategory\.mutateAsync/);
  assert.match(manager, /await actions\.deleteProduct\.mutateAsync/);
  assert.match(manager, /Если блюдо уже есть в истории заказов/);
  assert.match(manager, /Удалить навсегда/);
});
