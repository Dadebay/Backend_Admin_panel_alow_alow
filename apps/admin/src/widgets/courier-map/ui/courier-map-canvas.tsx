"use client";

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
import type {
  DispatchCourier,
  DispatchPickupDto,
} from "../model/map-types";

const ASHGABAT_CENTER: LatLngTuple = [37.9601, 58.3261];
const TILE_URL =
  process.env.NEXT_PUBLIC_MAP_TILE_URL ??
  "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

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
  couriers,
  pickup,
  selectedCourierId,
  onSelectCourier,
}: {
  couriers: DispatchCourier[];
  pickup: DispatchPickupDto;
  selectedCourierId: string | null;
  onSelectCourier: (courierId: string) => void;
}) {
  const selected =
    couriers.find(({ id }) => id === selectedCourierId) ?? couriers[0];
  const points: LatLngTuple[] = [];
  if (pickup.latitude !== null && pickup.longitude !== null) {
    points.push([pickup.latitude, pickup.longitude]);
  }
  for (const courier of couriers) {
    if (courier.location) {
      points.push([courier.location.latitude, courier.location.longitude]);
    }
  }
  if (selected) {
    for (const order of selected.activeOrders) {
      points.push([order.latitude, order.longitude]);
    }
  }

  const route: LatLngTuple[] = [];
  if (selected?.location) {
    route.push([selected.location.latitude, selected.location.longitude]);
  } else if (pickup.latitude !== null && pickup.longitude !== null) {
    route.push([pickup.latitude, pickup.longitude]);
  }
  if (selected) {
    route.push(
      ...selected.activeOrders.map(
        (order) => [order.latitude, order.longitude] as LatLngTuple,
      ),
    );
  }

  return (
    <MapContainer
      className="courier-map-canvas"
      center={points[0] ?? ASHGABAT_CENTER}
      zoom={13}
      scrollWheelZoom
      zoomControl
    >
      <TileLayer
        url={TILE_URL}
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      />
      <FitMap points={points} />
      {pickup.latitude !== null && pickup.longitude !== null && (
        <CircleMarker
          center={[pickup.latitude, pickup.longitude]}
          radius={10}
          pathOptions={{
            color: "#ffffff",
            fillColor: "#f36b46",
            fillOpacity: 1,
            weight: 3,
          }}
        >
          <Tooltip permanent direction="top">
            {pickup.name}
          </Tooltip>
          <Popup>
            <strong>{pickup.name}</strong>
            <br />
            {pickup.address ?? "Адрес точки выдачи не указан"}
          </Popup>
        </CircleMarker>
      )}
      {route.length > 1 && (
        <Polyline
          positions={route}
          pathOptions={{ color: "#f36b46", weight: 4, opacity: 0.78 }}
        />
      )}
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
      {selected?.activeOrders.map((order, index) => (
        <CircleMarker
          key={order.id}
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
            {index + 1}. #{order.number}
          </Tooltip>
          <Popup>
            <strong>Заказ #{order.number}</strong>
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
