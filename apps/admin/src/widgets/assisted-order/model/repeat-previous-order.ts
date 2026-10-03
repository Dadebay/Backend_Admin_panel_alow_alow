import type { Product } from "@/src/entities/catalog";
import type { Order } from "@/src/entities/order";

export function repeatPreviousOrder(
  order: Pick<Order, "items">,
  products: Product[],
) {
  const current = new Map(products.map((product) => [product.id, product]));
  const quantities: Record<string, number> = {};
  const unavailable: string[] = [];
  for (const item of order.items) {
    const product = current.get(item.productId);
    const variant = product?.variants.find(
      (candidate) =>
        candidate.id === item.productVariantId && candidate.isActive,
    );
    if (
      !product ||
      (product.pricingType === "VARIANT" && !variant) ||
      (product.pricingType === "FIXED" && item.productVariantId)
    ) {
      unavailable.push(
        item.variantName
          ? `${item.productName} · ${item.variantName}`
          : item.productName,
      );
      continue;
    }
    const key = `${product.id}:${variant?.id ?? "base"}`;
    quantities[key] = Math.min(50, (quantities[key] ?? 0) + item.quantity);
  }
  return { quantities, unavailable };
}
