import { BadRequestException } from "@nestjs/common";
import boundaries from "./data/delivery-service-area.json";
import { pointInDeliveryZone, type DeliveryZonePoint } from "./delivery-zone";

/** Each polygon has an outer ring followed by any excluded inner rings. */
export type ServiceAreaPolygon = readonly (readonly DeliveryZonePoint[])[];

// Keep the complete geometry, including holes, separate from tariff zones.
// Loading the versioned data at startup makes checkout independent of geocoding.
const polygons: readonly ServiceAreaPolygon[] = boundaries.regions.flatMap(
  (region) =>
    region.polygons.map((polygon) =>
      polygon.map((ring) =>
        ring.map(([longitude, latitude]) => ({
          latitude: latitude!,
          longitude: longitude!,
        })),
      ),
    ),
);

export function pointInServiceArea(
  point: DeliveryZonePoint,
  areas: readonly ServiceAreaPolygon[] = polygons,
) {
  if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude))
    return false;
  return areas.some(
    ([outer, ...holes]) =>
      outer &&
      pointInDeliveryZone(point, outer) &&
      !holes.some((hole) => pointInDeliveryZone(point, hole, false)),
  );
}

export function assertDeliveryServiceArea(point?: DeliveryZonePoint) {
  if (!point) {
    throw new BadRequestException({
      statusCode: 400,
      error: "Bad Request",
      code: "DELIVERY_LOCATION_REQUIRED",
      message:
        "Укажите точку доставки на карте, чтобы проверить зону обслуживания.",
    });
  }
  if (!pointInServiceArea(point)) {
    throw new BadRequestException({
      statusCode: 400,
      error: "Bad Request",
      code: "OUTSIDE_DELIVERY_AREA",
      message:
        "По этому адресу доставка пока недоступна. Обслуживаем Ахалский велаят и Ашхабад.",
    });
  }
}
