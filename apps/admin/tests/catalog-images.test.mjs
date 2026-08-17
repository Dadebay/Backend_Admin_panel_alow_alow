import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  canAddProductImages,
  MAX_PRODUCT_IMAGES,
} from "../src/entities/catalog/model/product-images.ts";

test("catalog image selection accepts up to the backend limit", () => {
  assert.equal(MAX_PRODUCT_IMAGES, 10);
  assert.equal(canAddProductImages(0, 10), true);
  assert.equal(canAddProductImages(7, 3), true);
  assert.equal(canAddProductImages(7, 4), false);
});

test("catalog image selection rejects invalid counts", () => {
  assert.equal(canAddProductImages(-1, 1), false);
  assert.equal(canAddProductImages(1, -1), false);
});

test("catalog editor configures generic variants with separate images", async () => {
  const source = await readFile(
    new URL(
      "../src/widgets/catalog-manager/ui/catalog-manager.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(source, /useFieldArray/);
  assert.match(source, /data-testid="product-variant-add"/);
  assert.match(source, /variants\.\$\{index\}\.imageFiles/);
  assert.match(source, /variantLabel: values\.variantLabel/);
  assert.match(source, /variant\.imageUrls/);
});
