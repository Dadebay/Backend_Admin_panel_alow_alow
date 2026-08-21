import type { components } from "@alowalow/api-contract";

export type DeliveryConfig = components["schemas"]["DeliveryConfigResponseDto"];
export type DeliveryWelayat = components["schemas"]["DeliveryWelayatResponseDto"];
export type DeliveryEtrap = components["schemas"]["DeliveryEtrapResponseDto"];
export type UpdateDeliverySettings =
  components["schemas"]["UpdateDeliverySettingsDto"];
export type CreateDeliveryWelayat =
  components["schemas"]["CreateDeliveryWelayatDto"];
export type UpdateDeliveryWelayat =
  components["schemas"]["UpdateDeliveryWelayatDto"];
export type CreateDeliveryEtrap =
  components["schemas"]["CreateDeliveryEtrapDto"];
export type UpdateDeliveryEtrap =
  components["schemas"]["UpdateDeliveryEtrapDto"];

export type DeliveryEtrapWithWelayat = DeliveryEtrap & {
  welayatNameRu: string;
  welayatNameTk: string;
};

export function flattenDeliveryEtraps(
  config: DeliveryConfig | undefined,
): DeliveryEtrapWithWelayat[] {
  return (config?.welayats ?? []).flatMap((welayat) =>
    welayat.etraps.map((etrap) => ({
      ...etrap,
      welayatNameRu: welayat.nameRu,
      welayatNameTk: welayat.nameTk,
    })),
  );
}

export function deliveryFeeForSubtotal(
  subtotal: number,
  etrap: Pick<DeliveryEtrap, "price" | "freeDeliveryThreshold">,
) {
  return etrap.freeDeliveryThreshold !== null &&
    subtotal >= etrap.freeDeliveryThreshold
    ? 0
    : etrap.price;
}
