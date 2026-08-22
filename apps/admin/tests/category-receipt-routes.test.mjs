import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCategoryPrinterUpdate,
  buildCategoryVisibilityUpdate,
} from "../src/widgets/catalog-manager/model/category-receipt-route.ts";

const category = {
  receiptPrinterIp: "192.168.10.51",
  sortOrder: 7,
  isActive: true,
};

test("category printer update preserves visibility and ordering", () => {
  assert.deepEqual(
    buildCategoryPrinterUpdate(category, "192.168.10.52"),
    {
      receiptPrinterIp: "192.168.10.52",
      sortOrder: 7,
      isActive: true,
    },
  );
  assert.deepEqual(buildCategoryPrinterUpdate(category, ""), {
    receiptPrinterIp: null,
    sortOrder: 7,
    isActive: true,
  });
  assert.equal(category.receiptPrinterIp, "192.168.10.51");
});

test("category visibility update preserves its printer route", () => {
  assert.deepEqual(buildCategoryVisibilityUpdate(category), {
    receiptPrinterIp: "192.168.10.51",
    sortOrder: 7,
    isActive: false,
  });
  assert.deepEqual(
    buildCategoryVisibilityUpdate({ ...category, isActive: false }),
    {
      receiptPrinterIp: "192.168.10.51",
      sortOrder: 7,
      isActive: true,
    },
  );
});
