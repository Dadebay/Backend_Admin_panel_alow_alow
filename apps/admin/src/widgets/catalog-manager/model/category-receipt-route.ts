import type { Category, UpdateCategory } from "@/src/entities/catalog";

type CategoryRouteSource = Pick<
  Category,
  "isActive" | "receiptPrinterIp" | "sortOrder"
>;

export function buildCategoryPrinterUpdate(
  category: CategoryRouteSource,
  receiptPrinterIp: string,
): UpdateCategory {
  return {
    receiptPrinterIp: receiptPrinterIp || null,
    sortOrder: category.sortOrder,
    isActive: category.isActive,
  };
}

export function buildCategoryVisibilityUpdate(
  category: CategoryRouteSource,
): UpdateCategory {
  return {
    receiptPrinterIp: category.receiptPrinterIp,
    sortOrder: category.sortOrder,
    isActive: !category.isActive,
  };
}
