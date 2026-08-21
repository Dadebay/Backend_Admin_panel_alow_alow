import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { groupProductsByCategory } from "../src/entities/catalog/model/product-groups.ts";

const products = [
  {
    id: "soup-1",
    categoryId: "soups",
    category: {
      id: "soups",
      name: "Çorbalar",
      sortOrder: 20,
      isActive: true,
    },
  },
  {
    id: "hot-1",
    categoryId: "hot",
    category: {
      id: "hot",
      name: "Gyzgyn naharlar",
      sortOrder: 10,
      isActive: true,
    },
  },
  {
    id: "soup-2",
    categoryId: "soups",
    category: {
      id: "soups",
      name: "Çorbalar",
      sortOrder: 20,
      isActive: true,
    },
  },
];

test("products are grouped and category order is preserved", () => {
  const groups = groupProductsByCategory(products);

  assert.deepEqual(
    groups.map(({ id, products: groupedProducts }) => [
      id,
      groupedProducts.map((product) => product.id),
    ]),
    [
      ["hot", ["hot-1"]],
      ["soups", ["soup-1", "soup-2"]],
    ],
  );
});

test("catalog and phone order expose category-grouped product navigation", async () => {
  const [catalog, assisted] = await Promise.all([
    readFile(
      new URL(
        "../src/widgets/catalog-manager/ui/catalog-manager.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../src/widgets/assisted-order/ui/assisted-order-dialog.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

  assert.match(catalog, /data-testid="catalog-product-groups"/);
  assert.match(catalog, /catalog-product-group-\$\{group\.id\}/);
  assert.match(catalog, /Блюда по категориям/);
  assert.match(assisted, /data-testid="assisted-product-categories"/);
  assert.match(assisted, /data-testid="assisted-product-category-all"/);
  assert.match(assisted, /assisted-product-group-\$\{group\.id\}/);
  assert.match(assisted, /productCategoryFilter/);
});
