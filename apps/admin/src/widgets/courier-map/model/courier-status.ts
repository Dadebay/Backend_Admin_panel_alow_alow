import type { DispatchCourier } from "@/src/entities/courier";

type CourierStatusSource = {
  activeOrders: Array<{ number: number }>;
  presence: "ONLINE" | "STALE" | "OFFLINE";
};

type CourierOverviewSource = CourierStatusSource & {
  location?: unknown | null;
};

export const courierPresenceLabels = {
  ONLINE: "На линии",
  STALE: "Связь потеряна",
  OFFLINE: "Не в сети",
} as const;

export type CourierWorkState = "BUSY" | "FREE";

export type CourierOverviewCounts = {
  busy: number;
  freeOnline: number;
  located: number;
  online: number;
  total: number;
};

export type CourierMapLocation = {
  courier: DispatchCourier;
  latitude: number;
  longitude: number;
};

export const courierRouteColors = [
  "#ec7a1b",
  "#31577f",
  "#c45f20",
  "#607b98",
  "#9f5429",
  "#123f6d",
] as const;

export function courierRouteColor(index: number) {
  return courierRouteColors[index % courierRouteColors.length];
}

export function courierName(
  courier: Pick<DispatchCourier, "firstName" | "lastName" | "phone">,
) {
  return (
    [courier.firstName, courier.lastName].filter(Boolean).join(" ") ||
    courier.phone
  );
}

export function courierMapLocations(
  couriers: DispatchCourier[],
): CourierMapLocation[] {
  return couriers.flatMap((courier) =>
    courier.location
      ? [
          {
            courier,
            latitude: courier.location.latitude,
            longitude: courier.location.longitude,
          },
        ]
      : [],
  );
}

export function courierLocationCoverage(couriers: DispatchCourier[]) {
  const located = courierMapLocations(couriers);
  return {
    located: located.length,
    total: couriers.length,
    missing: couriers.filter(({ location }) => !location),
  };
}

export function courierWorkState(courier: CourierStatusSource): CourierWorkState {
  return courier.activeOrders.length ? "BUSY" : "FREE";
}

export function courierWorkLabel(courier: CourierStatusSource) {
  if (!courier.activeOrders.length) return "Свободен";
  if (courier.activeOrders.length === 1) {
    return `В заказе #${courier.activeOrders[0].number}`;
  }
  return `В заказах · ${courier.activeOrders.length}`;
}

export function courierOverviewCounts(
  couriers: CourierOverviewSource[],
): CourierOverviewCounts {
  return couriers.reduce<CourierOverviewCounts>(
    (counts, courier) => ({
      busy: counts.busy + Number(courier.activeOrders.length > 0),
      freeOnline:
        counts.freeOnline +
        Number(
          courier.presence === "ONLINE" && !courier.activeOrders.length,
        ),
      located: counts.located + Number(Boolean(courier.location)),
      online: counts.online + Number(courier.presence === "ONLINE"),
      total: counts.total + 1,
    }),
    { busy: 0, freeOnline: 0, located: 0, online: 0, total: 0 },
  );
}
