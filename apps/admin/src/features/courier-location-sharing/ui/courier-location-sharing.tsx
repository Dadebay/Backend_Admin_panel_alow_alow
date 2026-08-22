import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type { components } from "@alowalow/api-contract";
import { useSession } from "@/src/shared/auth";
import { COURIER_LOCATION_UPDATE_INTERVAL_MS } from "../model/location-sharing";

type LocationInput = components["schemas"]["UpdateCourierLocationDto"];
type LocationResponse =
  components["schemas"]["UpdateCourierLocationResponseDto"];

function toLocationInput(position: GeolocationPosition): LocationInput {
  const { coords } = position;
  return {
    latitude: coords.latitude,
    longitude: coords.longitude,
    ...(Number.isFinite(coords.accuracy)
      ? { accuracy: coords.accuracy }
      : {}),
    ...(coords.heading !== null && Number.isFinite(coords.heading)
      ? { heading: coords.heading }
      : {}),
    ...(coords.speed !== null && Number.isFinite(coords.speed)
      ? { speed: coords.speed }
      : {}),
    recordedAt: new Date(position.timestamp).toISOString(),
  };
}

export function CourierLocationSharing() {
  const { authorizedRequest } = useSession();
  const [sharing, setSharing] = useState(false);
  const [geoError, setGeoError] = useState("");
  const [lastSentAt, setLastSentAt] = useState<string | null>(null);
  const latestPosition = useRef<GeolocationPosition | null>(null);
  const publishPending = useRef(false);

  const {
    mutateAsync: publishLocation,
    error: publishError,
  } = useMutation({
    mutationFn: (location: LocationInput) =>
      authorizedRequest<LocationResponse>("/tracking/me/location", {
        method: "PUT",
        body: JSON.stringify(location),
      }),
    onSuccess: (response) => {
      setLastSentAt(response.location.receivedAt);
      setGeoError("");
    },
  });

  const publish = useCallback(
    async (position: GeolocationPosition) => {
      if (publishPending.current) return;
      publishPending.current = true;
      try {
        await publishLocation(toLocationInput(position));
      } catch {
        // TanStack Mutation exposes the normalized API error in the UI.
      } finally {
        publishPending.current = false;
      }
    },
    [publishLocation],
  );

  useEffect(() => {
    if (!sharing) return;

    let firstReadingSent = false;
    const onPosition = (position: GeolocationPosition) => {
      latestPosition.current = position;
      if (!firstReadingSent) {
        firstReadingSent = true;
        void publish(position);
      }
    };
    const onError = (error: GeolocationPositionError) => {
      setGeoError(
        error.code === error.PERMISSION_DENIED
          ? "Доступ к геолокации запрещён. Разрешите его в настройках браузера."
          : "Не удалось получить свежую GPS-точку.",
      );
    };
    const options: PositionOptions = {
      enableHighAccuracy: true,
      timeout: 20_000,
      maximumAge: 90_000,
    };
    const watchId = navigator.geolocation.watchPosition(
      onPosition,
      onError,
      options,
    );
    const interval = window.setInterval(() => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          latestPosition.current = position;
          void publish(position);
        },
        onError,
        options,
      );
    }, COURIER_LOCATION_UPDATE_INTERVAL_MS);

    return () => {
      navigator.geolocation.clearWatch(watchId);
      window.clearInterval(interval);
    };
  }, [publish, sharing]);

  async function stopSharing() {
    setSharing(false);
    latestPosition.current = null;
    await authorizedRequest("/tracking/me/location", {
      method: "DELETE",
    }).catch(() => undefined);
  }

  const mutationError =
    publishError instanceof Error ? publishError.message : "";

  return (
    <section
      className="courier-sharing-card"
      data-testid="courier-location-sharing"
    >
      <div className="sharing-status">
        <span className={sharing ? "sharing-dot active" : "sharing-dot"} />
        <div>
          <strong>
            {sharing ? "Геолокация передаётся" : "Геолокация выключена"}
          </strong>
          <p>
            {sharing
              ? "Новая точка отправляется диспетчеру каждые 15 секунд, даже без активного заказа."
              : "Включите геолокацию в начале смены и выключите после её завершения."}
          </p>
        </div>
      </div>
      {lastSentAt && (
        <p className="last-location">
          Последнее обновление:{" "}
          {new Intl.DateTimeFormat("ru-RU", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          }).format(new Date(lastSentAt))}
        </p>
      )}
      {(geoError || mutationError) && (
        <p className="form-error">{geoError || mutationError}</p>
      )}
      {sharing ? (
        <button
          className="secondary-button"
          data-testid="courier-location-sharing-stop"
          type="button"
          onClick={() => void stopSharing()}
        >
          Завершить смену и скрыть точку
        </button>
      ) : (
        <button
          className="primary-button"
          data-testid="courier-location-sharing-start"
          type="button"
          onClick={() => {
            setGeoError("");
            if (!("geolocation" in navigator)) {
              setGeoError("Этот браузер не поддерживает геолокацию.");
              return;
            }
            setSharing(true);
          }}
        >
          Включить геолокацию
        </button>
      )}
      <small>
        Не выключайте геолокацию после доставки: свободный курьер должен
        оставаться виден диспетчеру. Мобильный браузер может приостанавливать GPS
        после блокировки экрана.
      </small>
    </section>
  );
}
