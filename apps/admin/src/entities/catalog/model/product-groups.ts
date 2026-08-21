type GroupableCategory = {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
};

type GroupableProduct = {
  categoryId: string;
  category?: GroupableCategory;
};

export type ProductCategoryGroup<TProduct extends GroupableProduct> = {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  products: TProduct[];
};

export function groupProductsByCategory<TProduct extends GroupableProduct>(
  products: readonly TProduct[],
) {
  const groups = new Map<string, ProductCategoryGroup<TProduct>>();

  for (const product of products) {
    const category = product.category;
    const categoryId = category?.id ?? product.categoryId;
    const current = groups.get(categoryId);

    if (current) {
      current.products.push(product);
      continue;
    }

    groups.set(categoryId, {
      id: categoryId,
      name: category?.name ?? "Без категории",
      sortOrder: category?.sortOrder ?? Number.MAX_SAFE_INTEGER,
      isActive: category?.isActive ?? false,
      products: [product],
    });
  }

  return [...groups.values()].sort(
    (left, right) =>
      left.sortOrder - right.sortOrder || left.name.localeCompare(right.name),
  );
}
