import type { components } from "@alowalow/api-contract";
import type { CourierRoute, DispatchCourier, DispatchOrder } from "@/src/entities/courier";

export type { DispatchCourier, DispatchOrder };
export type DispatchBranchDto =
  components["schemas"]["DispatchBranchDto"];

export type CourierRouteOverlay = {
  color: string;
  courier: DispatchCourier;
  route: CourierRoute;
};
