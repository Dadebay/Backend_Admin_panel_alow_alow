export function calculateDeliveryFee(
  subtotal: number,
  price: number,
  freeDeliveryThreshold: number | null,
) {
  return freeDeliveryThreshold !== null && subtotal >= freeDeliveryThreshold
    ? 0
    : price;
}

export const DELIVERY_TIME_ZONE = "Asia/Ashgabat";
const localClock = new Intl.DateTimeFormat("en-GB", {
  timeZone: DELIVERY_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export type NightDeliverySchedule = {
  nightTariffEnabled: boolean;
  nightStartsAt: string;
  nightEndsAt: string;
};

function minuteOfDay(time: string) {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

/** The server chooses the tariff; clients cannot supply their own clock. */
export function resolveDeliveryPeriod(
  settings: NightDeliverySchedule,
  at: Date,
) {
  if (!settings.nightTariffEnabled) {
    return {
      tariff: "DAY" as const,
      validUntil: null,
      timeZone: DELIVERY_TIME_ZONE,
    };
  }
  const start = minuteOfDay(settings.nightStartsAt);
  const end = minuteOfDay(settings.nightEndsAt);
  const now = minuteOfDay(localClock.format(at));
  const night =
    start < end ? now >= start && now < end : now >= start || now < end;
  const boundary = night ? end : start;
  // Ashgabat has a fixed UTC+05:00 offset. Preserve exact minute boundaries
  // even if the quote is requested near the end of a minute.
  const remainingMinutes = (boundary - now + 1440) % 1440;
  const validUntil = new Date(
    at.getTime() +
      remainingMinutes * 60_000 -
      at.getUTCSeconds() * 1000 -
      at.getUTCMilliseconds(),
  ).toISOString();
  return {
    tariff: night ? ("NIGHT" as const) : ("DAY" as const),
    validUntil,
    timeZone: DELIVERY_TIME_ZONE,
  };
}
