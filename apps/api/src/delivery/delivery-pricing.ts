export function calculateDeliveryFee(
  subtotal: number,
  price: number,
  freeDeliveryThreshold: number | null,
) {
  return freeDeliveryThreshold !== null && subtotal >= freeDeliveryThreshold
    ? 0
    : price;
}
