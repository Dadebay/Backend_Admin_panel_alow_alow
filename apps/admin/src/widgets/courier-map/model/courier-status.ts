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
