import assert from "node:assert/strict";
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
