import { Fragment, useEffect } from "react";
import {
  CircleMarker,
  MapContainer,
  Polyline,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import type { LatLngBoundsExpression, LatLngTuple } from "leaflet";
import { MAP_ATTRIBUTION, MAP_TILE_URL } from "@/src/shared/map";
import { brandColors } from "@/src/shared/ui";
import {
  courierMapLocations,
  courierName,
  courierPresenceLabels,
  courierRouteColor,
  courierWorkLabel,
  courierWorkState,
} from "../model/courier-status";
import type {
  CourierRouteOverlay,
  DispatchBranchDto,
  DispatchCourier,
} from "../model/map-types";

const ASHGABAT_CENTER: LatLngTuple = [37.9601, 58.3261];
function FitMap({ points }: { points: LatLngTuple[] }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    if (points.length === 1) {
      map.setView(points[0], 14, { animate: false });
      return;
    }
    map.fitBounds(points as LatLngBoundsExpression, {
      padding: [24, 24],
      maxZoom: 15,
      animate: false,
    });
  }, [map, points]);
  return null;
}

export default function CourierMapCanvas({
  branches,
  couriers,
  selectedCourierId,
  routes,
  onSelectCourier,
}: {
  branches: DispatchBranchDto[];
  couriers: DispatchCourier[];
  selectedCourierId: string | null;
  routes: CourierRouteOverlay[];
  onSelectCourier: (courierId: string) => void;
}) {
  const selected =
    couriers.find(({ id }) => id === selectedCourierId) ?? null;
  const routeByCourierId = new Map(
    routes.map((overlay) => [overlay.courier.id, overlay]),
  );
  const visibleCouriers = selected
    ? [selected]
    : couriers.filter(({ activeOrders }) => activeOrders.length);
  const stopGroups = visibleCouriers.map((courier) => {
    const overlay = routeByCourierId.get(courier.id);
    return {
      color:
        overlay?.color ??
        courierRouteColor(couriers.findIndex(({ id }) => id === courier.id)),
      courier,
      stops: overlay?.route.stops ?? courier.activeOrders,
    };
  });
  const routeLines = routes.flatMap(({ color, courier, route }) =>
    route.routingStatus === "READY" && route.route
      ? [
          {
            color,
            courier,
            orderNumbers: route.stops.map(({ orderNumber }) => orderNumber),
            points: route.route.geometry.coordinates.map(
              ([longitude, latitude]) =>
                [latitude, longitude] satisfies LatLngTuple,
            ),
          },
        ]
      : [],
  );
  const points: LatLngTuple[] = routeLines.flatMap(({ points }) => points);
  const courierLocations = courierMapLocations(couriers);
  for (const location of courierLocations) {
    points.push([location.latitude, location.longitude]);
  }
  if (!selected) {
    for (const branch of branches) {
      points.push([branch.latitude, branch.longitude]);
    }
  }
  for (const { stops } of stopGroups) {
    for (const order of stops) {
      if (order.branch?.latitude != null && order.branch.longitude != null) {
        points.push([order.branch.latitude, order.branch.longitude]);
      }
      points.push([order.latitude, order.longitude]);
    }
  }
  if (!points.length) {
    for (const branch of branches) {
      points.push([branch.latitude, branch.longitude]);
    }
  }

  return (
    <MapContainer
      className="courier-map-canvas"
      center={points[0] ?? ASHGABAT_CENTER}
      zoom={13}
      scrollWheelZoom
      zoomControl
      data-testid="dispatch-courier-map"
    >
      <TileLayer
        url={MAP_TILE_URL}
        attribution={MAP_ATTRIBUTION}
      />
      <FitMap points={points} />
      {routeLines.map(({ color, courier, orderNumbers, points: routeLine }) => (
        <Fragment key={courier.id}>
          <Polyline
            positions={routeLine}
            pathOptions={{ color: brandColors.cream, weight: 10, opacity: 0.9 }}
          />
          <Polyline
            positions={routeLine}
            pathOptions={{ color, weight: 6, opacity: 0.95 }}
            eventHandlers={{ click: () => onSelectCourier(courier.id) }}
          >
            <Tooltip sticky>
              {courierName(courier)} · {orderNumbers
                .map((number) => `#${number}`)
                .join(", ")}
            </Tooltip>
          </Polyline>
        </Fragment>
      ))}
      {branches.map((branch) => (
        <CircleMarker
          key={branch.id}
          center={[branch.latitude, branch.longitude]}
          radius={10}
          pathOptions={{
            color: brandColors.cream,
            fillColor: brandColors.orange,
            fillOpacity: 1,
            weight: 3,
          }}
        >
          <Tooltip permanent direction="top">
            Филиал · {branch.name}
          </Tooltip>
          <Popup>
            <strong>Филиал · {branch.name}</strong>
            <br />
            {branch.address}
          </Popup>
        </CircleMarker>
      ))}
      {courierLocations.map(({ courier, latitude, longitude }) => {
        const workState = courierWorkState(courier);
        const workLabel = courierWorkLabel(courier);
        const routeColor =
          routeByCourierId.get(courier.id)?.color ??
          courierRouteColor(couriers.findIndex(({ id }) => id === courier.id));
        return (
          <CircleMarker
            key={courier.id}
            center={[latitude, longitude]}
            radius={courier.id === selected?.id ? 11 : 8}
            pathOptions={{
              color: brandColors.cream,
              fillColor:
                workState === "BUSY" ? routeColor : brandColors.navy,
              fillOpacity: courier.presence === "ONLINE" ? 1 : 0.62,
              weight: 3,
              ...(courier.presence === "ONLINE" ? {} : { dashArray: "4 3" }),
            }}
            eventHandlers={{ click: () => onSelectCourier(courier.id) }}
          >
            <Tooltip
              className={`courier-marker-tooltip ${workState.toLowerCase()}`}
              direction="top"
              permanent
            >
              <strong>{courierName(courier)}</strong>
              <span>{workLabel}</span>
            </Tooltip>
            <Popup>
              <strong>{courierName(courier)}</strong>
              <br />
              {workLabel}
              <br />
              {courierPresenceLabels[courier.presence]}
              <br />
              {courier.phone}
            </Popup>
          </CircleMarker>
        );
      })}
      {stopGroups.flatMap(({ color, courier, stops }) =>
        stops.map((order, index) => {
          const orderNumber =
            "number" in order ? order.number : order.orderNumber;
          return (
            <CircleMarker
              key={`${courier.id}:${"id" in order ? order.id : order.orderId}`}
              center={[order.latitude, order.longitude]}
              radius={8}
              pathOptions={{
                color: brandColors.cream,
                fillColor: color,
                fillOpacity: 1,
                weight: 3,
              }}
            >
              <Tooltip permanent direction="right">
                {selected
                  ? `${index + 1}. #${orderNumber}`
                  : `${courierName(courier)} · #${orderNumber}`}
              </Tooltip>
              <Popup>
                <strong>{courierName(courier)}</strong>
                <br />
                Заказ #{orderNumber}
                <br />
                {order.address}
                <br />
                {order.customer.firstName ?? "Клиент"} · {order.customer.phone}
              </Popup>
            </CircleMarker>
          );
        }),
      )}
    </MapContainer>
  );
}
