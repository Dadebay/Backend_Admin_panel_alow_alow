import { useEffect } from "react";
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
import type { CourierRoute } from "@/src/entities/courier";
import type {
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

function courierName(courier: DispatchCourier) {
  return (
    [courier.firstName, courier.lastName].filter(Boolean).join(" ") ||
    courier.phone
  );
}

export default function CourierMapCanvas({
  branches,
  couriers,
  selectedCourierId,
  route,
  onSelectCourier,
}: {
  branches: DispatchBranchDto[];
  couriers: DispatchCourier[];
  selectedCourierId: string | null;
  route: CourierRoute | null;
  onSelectCourier: (courierId: string) => void;
}) {
  const selected =
    couriers.find(({ id }) => id === selectedCourierId) ?? couriers[0];
  const deliveryStops = route?.stops ?? selected?.activeOrders ?? [];
  const routeLine: LatLngTuple[] =
    route?.routingStatus === "READY" && route.route
      ? route.route.geometry.coordinates.map(([longitude, latitude]) => [
          latitude,
          longitude,
        ])
      : [];
  const points: LatLngTuple[] = [...routeLine];
  if (!points.length) {
    for (const branch of branches) {
      points.push([branch.latitude, branch.longitude]);
    }
    for (const courier of couriers) {
      if (courier.location) {
        points.push([courier.location.latitude, courier.location.longitude]);
      }
    }
    for (const order of deliveryStops) {
      if (order.branch?.latitude != null && order.branch.longitude != null) {
        points.push([order.branch.latitude, order.branch.longitude]);
      }
      points.push([order.latitude, order.longitude]);
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
      {routeLine.length > 1 && (
        <>
          <Polyline
            positions={routeLine}
            pathOptions={{ color: "#ffffff", weight: 10, opacity: 0.9 }}
          />
          <Polyline
            positions={routeLine}
            pathOptions={{ color: "#f36b46", weight: 6, opacity: 0.95 }}
          />
        </>
      )}
      {branches.map((branch) => (
        <CircleMarker
          key={branch.id}
          center={[branch.latitude, branch.longitude]}
          radius={10}
          pathOptions={{
            color: "#ffffff",
            fillColor: "#f36b46",
            fillOpacity: 1,
            weight: 3,
          }}
        >
          <Tooltip permanent direction="top">
            {branch.name}
          </Tooltip>
          <Popup>
            <strong>{branch.name}</strong>
            <br />
            {branch.address}
          </Popup>
        </CircleMarker>
      ))}
      {couriers.map((courier) =>
        courier.location ? (
          <CircleMarker
            key={courier.id}
            center={[
              courier.location.latitude,
              courier.location.longitude,
            ]}
            radius={courier.id === selected?.id ? 11 : 8}
            pathOptions={{
              color: "#ffffff",
              fillColor:
                courier.presence === "ONLINE" ? "#25323d" : "#9099a1",
              fillOpacity: 1,
              weight: 3,
            }}
            eventHandlers={{ click: () => onSelectCourier(courier.id) }}
          >
            <Tooltip direction="top">{courierName(courier)}</Tooltip>
            <Popup>
              <strong>{courierName(courier)}</strong>
              <br />
              {courier.phone}
              <br />
              {courier.activeOrders.length} активных заказов
            </Popup>
          </CircleMarker>
        ) : null,
      )}
      {deliveryStops.map((order, index) => (
        <CircleMarker
          key={"id" in order ? order.id : order.orderId}
          center={[order.latitude, order.longitude]}
          radius={8}
          pathOptions={{
            color: "#ffffff",
            fillColor: "#338f75",
            fillOpacity: 1,
            weight: 3,
          }}
        >
          <Tooltip permanent direction="right">
            {index + 1}. #{"number" in order ? order.number : order.orderNumber}
          </Tooltip>
          <Popup>
            <strong>
              Заказ #{"number" in order ? order.number : order.orderNumber}
            </strong>
            <br />
            {order.address}
            <br />
            {order.customer.firstName ?? "Клиент"} · {order.customer.phone}
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
