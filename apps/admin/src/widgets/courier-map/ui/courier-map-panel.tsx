import { lazy, Suspense, useState } from "react";
import {
  useCourierRoute,
  useCourierRoutes,
  useDispatchLiveUpdates,
  useDispatchSnapshot,
} from "@/src/entities/courier";
import { orderItemLabel } from "@/src/entities/order";
import { OtpLoginCard } from "@/src/features/otp-login";
import { useSession } from "@/src/shared/auth";
import {
  courierLocationCoverage,
  courierName,
  courierOverviewCounts,
  courierPresenceLabels,
  courierRouteColor,
  courierWorkLabel,
  courierWorkState,
} from "../model/courier-status";
import type { CourierRouteOverlay } from "../model/map-types";

const CourierMapCanvas = lazy(() => import("./courier-map-canvas"));

const ACCESS_ROLES = new Set(["OPERATOR", "ADMIN", "SUPER_ADMIN"]);

function formatLocationTime(value?: string) {
  if (!value) return "GPS ещё не получен";
  return `GPS ${new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))}`;
}

export function CourierMapPanel() {
  const { session, ready, logout } = useSession();
  const dispatch = useDispatchSnapshot();
  const liveState = useDispatchLiveUpdates();
  const [selectedCourierId, setSelectedCourierId] = useState<string | null>(
    null,
  );
  const branches = dispatch.data?.branches ?? [];
  const couriers = dispatch.data?.couriers ?? [];
  const selected =
    couriers.find(({ id }) => id === selectedCourierId) ?? null;
  const busyCouriers = couriers.filter(({ activeOrders }) => activeOrders.length);
  const courierRoute = useCourierRoute(selected?.id ?? null);
  const overviewRoutes = useCourierRoutes(
    selected ? [] : busyCouriers.map(({ id }) => id),
  );
  const overviewRouteByCourierId = new Map(
    (overviewRoutes.data ?? []).map(({ courierId, route }) => [courierId, route]),
  );
  const routeOverlays: CourierRouteOverlay[] = selected
    ? courierRoute.data
      ? [
          {
            color: courierRouteColor(
              couriers.findIndex(({ id }) => id === selected.id),
            ),
            courier: selected,
            route: courierRoute.data,
          },
        ]
      : []
    : busyCouriers.flatMap((courier) => {
        const route = overviewRouteByCourierId.get(courier.id);
        return route
          ? [
              {
                color: courierRouteColor(
                  couriers.findIndex(({ id }) => id === courier.id),
                ),
                courier,
                route,
              },
            ]
          : [];
      });
  const displayedStops =
    courierRoute.data?.stops ?? selected?.activeOrders ?? [];
  const overviewCounts = courierOverviewCounts(couriers);
  const locationCoverage = courierLocationCoverage(couriers);

  if (!ready) {
    return (
      <aside className="dispatch-card live-dispatch">
        <div className="section-head compact">
          <div>
            <h2>Курьеры на карте</h2>
            <p>Подключаем защищённую сессию</p>
          </div>
        </div>
        <div className="map-loading">Проверяем сессию…</div>
      </aside>
    );
  }

  if (!session) {
    return (
      <aside className="dispatch-card live-dispatch">
        <div className="section-head compact">
          <div>
            <h2>Курьеры на карте</h2>
            <p>Войдите как оператор или администратор</p>
          </div>
        </div>
        <OtpLoginCard
          title="Подключить живую карту"
          description="Доступ защищён ролью сотрудника."
        />
      </aside>
    );
  }

  if (!ACCESS_ROLES.has(session.user.role)) {
    return (
      <aside className="dispatch-card live-dispatch">
        <div className="section-head compact">
          <div>
            <h2>Карта диспетчера</h2>
            <p>Недостаточно прав</p>
          </div>
        </div>
        <div className="map-message">
          Карта клиентов доступна только оператору и администраторам.
          {session.user.role === "COURIER" && (
            <a data-testid="dispatch-open-courier" href="/courier">
              Открыть экран курьера →
            </a>
          )}
          <button className="text-button" onClick={() => void logout()}>
            Выйти
          </button>
        </div>
      </aside>
    );
  }

  if (dispatch.isPending) {
    return (
      <aside className="dispatch-card live-dispatch">
        <div className="map-loading">Получаем курьеров и точки доставки…</div>
      </aside>
    );
  }

  if (dispatch.isError || !dispatch.data) {
    return (
      <aside className="dispatch-card live-dispatch">
        <div className="section-head compact">
          <div>
            <h2>Курьеры на карте</h2>
            <p>Нет соединения с backend</p>
          </div>
        </div>
        <div className="map-message">
          <p>
            {dispatch.error instanceof Error
              ? dispatch.error.message
              : "Не удалось загрузить карту"}
          </p>
          <button
            className="secondary-button"
            onClick={() => void dispatch.refetch()}
          >
            Повторить
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside
      className="dispatch-card live-dispatch"
      data-testid="dispatch-map-panel"
    >
      <div className="section-head compact">
        <div>
          <p>
            Обновлено{" "}
            {new Intl.DateTimeFormat("ru-RU", {
              hour: "2-digit",
              minute: "2-digit",
            }).format(new Date(dispatch.data.generatedAt))}
            {liveState === "live"
              ? " · LIVE"
              : liveState === "connecting"
                ? " · подключение"
                : " · резервное обновление"}
          </p>
        </div>
        <button
          className="square-button"
          data-testid="dispatch-refresh-map"
          aria-label="Обновить карту"
          onClick={() => {
            void dispatch.refetch();
            if (selected) {
              void courierRoute.refetch();
            } else {
              void overviewRoutes.refetch();
            }
          }}
        >
          ↻
        </button>
      </div>

      {locationCoverage.missing.length > 0 && (
        <div
          className="dispatch-location-coverage"
          data-testid="dispatch-location-coverage"
          role="status"
        >
          <div>
            <strong>
              GPS передают {locationCoverage.located} из {locationCoverage.total}
            </strong>
            <p>
              Без GPS: {locationCoverage.missing.map(courierName).join(", ")}.
              Курьер включает передачу на <code>a7-tagam.com.tm/courier</code> →
              «Начать смену».
              {locationCoverage.located === 0 &&
                " Видимые служебные точки на карте — филиалы, а не курьеры."}
            </p>
          </div>
        </div>
      )}

      <Suspense fallback={<div className="map-loading">Загружаем карту…</div>}>
        <CourierMapCanvas
          branches={branches}
          couriers={couriers}
          selectedCourierId={selected?.id ?? null}
          routes={routeOverlays}
          onSelectCourier={setSelectedCourierId}
        />
      </Suspense>

      {!selected && busyCouriers.length > 0 && (
        <section
          className="courier-route-overview"
          data-testid="dispatch-route-overview"
        >
          <div className="courier-route-overview-heading">
            <strong>Маршруты всех занятых курьеров</strong>
            <span>Нажмите курьера, чтобы открыть детали.</span>
          </div>
          <div className="courier-route-legend">
            {busyCouriers.map((courier) => {
              const route = overviewRouteByCourierId.get(courier.id);
              const plannedRoute = route?.route;
              const color = courierRouteColor(
                couriers.findIndex(({ id }) => id === courier.id),
              );
              return (
                <button
                  key={courier.id}
                  data-testid={`dispatch-route-legend-${courier.id}`}
                  onClick={() => setSelectedCourierId(courier.id)}
                >
                  <span
                    className="courier-route-swatch"
                    style={{ backgroundColor: color }}
                    aria-hidden="true"
                  />
                  <span>
                    <strong>{courierName(courier)}</strong>
                    <small>
                      Заказы: {courier.activeOrders
                        .map(({ number }) => `#${number}`)
                        .join(", ")}
                    </small>
                  </span>
                  <em>
                    {overviewRoutes.isPending
                      ? "Строим…"
                      : plannedRoute
                        ? `${(plannedRoute.distanceMeters / 1_000).toFixed(1)} км · ~${Math.max(
                            1,
                            Math.ceil(plannedRoute.durationSeconds / 60),
                          )} мин`
                        : "Маршрут недоступен"}
                  </em>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {selected && (
        <div
          className="courier-route-status"
          data-testid="dispatch-route-summary"
        >
          {courierRoute.isPending ? (
            <span>Строим дорожный маршрут…</span>
          ) : courierRoute.data?.routingStatus === "READY" &&
            courierRoute.data.route ? (
            <>
              <strong>
                {(courierRoute.data.route.distanceMeters / 1_000).toFixed(1)} км
                {" · ~"}
                {Math.max(
                  1,
                  Math.ceil(courierRoute.data.route.durationSeconds / 60),
                )}{" "}
                мин
              </strong>
              <span>
                Следующие точки: {courierRoute.data.route.nextWaypoints.length}
              </span>
            </>
          ) : courierRoute.data?.routingStatus === "NO_STOPS" ? (
            <span>Активных точек маршрута нет.</span>
          ) : (
            <span>Маршрутный сервис временно недоступен; точки сохранены.</span>
          )}
        </div>
      )}

      {!couriers.length ? (
        <div className="map-message">
          Активных курьеров пока нет. Добавьте сотрудника с ролью COURIER.
        </div>
      ) : (
        <>
          <div className="live-courier-list">
            <button
              className={
                !selected
                  ? "selected courier-overview-button"
                  : "courier-overview-button"
              }
              data-testid="dispatch-show-all-couriers"
              onClick={() => setSelectedCourierId(null)}
            >
              <span className="presence-dot online" />
              <span>
                <strong>Все курьеры</strong>
                <small>
                  В заказе: {overviewCounts.busy} · свободных: {overviewCounts.freeOnline}
                  {" · "}
                  GPS у {overviewCounts.located} из {overviewCounts.total}
                </small>
              </span>
              <em>{overviewCounts.online} на линии</em>
            </button>
            {couriers.map((courier) => (
              <button
                key={courier.id}
                className={courier.id === selected?.id ? "selected" : ""}
                data-testid={`dispatch-select-courier-${courier.id}`}
                onClick={() => setSelectedCourierId(courier.id)}
              >
                <span
                  className={`presence-dot ${courier.presence.toLowerCase()}`}
                />
                <span>
                  <strong>{courierName(courier)}</strong>
                  <small>
                    {formatLocationTime(courier.location?.recordedAt)} ·{" "}
                    {courierPresenceLabels[courier.presence]}
                  </small>
                </span>
                <em
                  className={`courier-work-status ${courierWorkState(courier).toLowerCase()}`}
                >
                  {courierWorkLabel(courier)}
                </em>
              </button>
            ))}
          </div>

          {selected && (
            <div className="courier-route-details">
              <div className="courier-contact">
                <div>
                  <strong>{courierName(selected)}</strong>
                  <a href={`tel:${selected.phone}`}>{selected.phone}</a>
                </div>
                <span>
                  {selected.rating ? `${selected.rating} ★` : "Нет рейтинга"}
                </span>
              </div>
              {displayedStops.length ? (
                displayedStops.map((order, index) => {
                  const orderNumber =
                    "number" in order ? order.number : order.orderNumber;
                  return (
                    <article
                      className="delivery-stop"
                      key={"id" in order ? order.id : order.orderId}
                    >
                      <span>{index + 1}</span>
                      <div>
                        <div className="delivery-stop-title">
                          <strong>Заказ #{orderNumber}</strong>
                          <b>{order.cashToCollect} TMT</b>
                        </div>
                        <p>{order.address}</p>
                        {order.branch && (
                          <div className="order-branch-row">
                            Забрать: <strong>{order.branch.name}</strong>
                            {order.branch.address &&
                              ` · ${order.branch.address}`}
                          </div>
                        )}
                        {(order.entrance || order.floor || order.apartment) && (
                          <small>
                            {[
                              order.entrance && `подъезд ${order.entrance}`,
                              order.floor && `этаж ${order.floor}`,
                              order.apartment && `кв. ${order.apartment}`,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </small>
                        )}
                        <a href={`tel:${order.customer.phone}`}>
                          {[order.customer.firstName, order.customer.lastName]
                            .filter(Boolean)
                            .join(" ") || "Клиент"}{" "}
                          · {order.customer.phone}
                        </a>
                        <ul>
                          {order.items.map((item) => (
                            <li
                              key={`${item.productName}:${item.variantName ?? "base"}`}
                            >
                              {orderItemLabel(item)} × {item.quantity}
                            </li>
                          ))}
                        </ul>
                        {order.customerNote && (
                          <p className="customer-note">{order.customerNote}</p>
                        )}
                      </div>
                    </article>
                  );
                })
              ) : (
                <p className="no-stops">У курьера нет активных заказов.</p>
              )}
            </div>
          )}
        </>
      )}
    </aside>
  );
}
