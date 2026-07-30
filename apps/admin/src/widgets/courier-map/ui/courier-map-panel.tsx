import { lazy, Suspense, useState } from "react";
import { useDispatchSnapshot, type DispatchCourier } from "@/src/entities/courier";
import { OtpLoginCard } from "@/src/features/otp-login";
import { useSession } from "@/src/shared/auth";

const CourierMapCanvas = lazy(() => import("./courier-map-canvas"));

const ACCESS_ROLES = new Set(["OPERATOR", "ADMIN", "SUPER_ADMIN"]);

const presenceLabels = {
  ONLINE: "На линии",
  STALE: "Связь потеряна",
  OFFLINE: "Не в сети",
} as const;

function courierName(courier: DispatchCourier) {
  return (
    [courier.firstName, courier.lastName].filter(Boolean).join(" ") ||
    courier.phone
  );
}

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
  const [selectedCourierId, setSelectedCourierId] = useState<string | null>(
    null,
  );

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
        <div className="map-loading">Получаем курьеров и маршруты…</div>
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

  const { couriers, pickup } = dispatch.data;
  const selected =
    couriers.find(({ id }) => id === selectedCourierId) ??
    couriers.find(({ presence }) => presence === "ONLINE") ??
    couriers[0] ??
    null;

  return (
    <aside
      className="dispatch-card live-dispatch"
      data-testid="dispatch-map-panel"
    >
      <div className="section-head compact">
        <div>
          <h2>Курьеры на карте</h2>
          <p>
            Ашхабад · обновлено{" "}
            {new Intl.DateTimeFormat("ru-RU", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            }).format(new Date(dispatch.data.generatedAt))}
          </p>
        </div>
        <button
          className="square-button"
          aria-label="Обновить карту"
          onClick={() => void dispatch.refetch()}
        >
          ↻
        </button>
      </div>

      <Suspense fallback={<div className="map-loading">Загружаем карту…</div>}>
        <CourierMapCanvas
          couriers={couriers}
          pickup={pickup}
          selectedCourierId={selected?.id ?? null}
          onSelectCourier={setSelectedCourierId}
        />
      </Suspense>

      {!couriers.length ? (
        <div className="map-message">
          Активных курьеров пока нет. Добавьте сотрудника с ролью COURIER.
        </div>
      ) : (
        <>
          <div className="live-courier-list">
            {couriers.map((courier) => (
              <button
                key={courier.id}
                className={courier.id === selected?.id ? "selected" : ""}
                onClick={() => setSelectedCourierId(courier.id)}
              >
                <span
                  className={`presence-dot ${courier.presence.toLowerCase()}`}
                />
                <span>
                  <strong>{courierName(courier)}</strong>
                  <small>
                    {courier.activeOrders.length} заказов ·{" "}
                    {formatLocationTime(courier.location?.recordedAt)}
                  </small>
                </span>
                <em>{presenceLabels[courier.presence]}</em>
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
              <div className="pickup-row">
                <span>A</span>
                <div>
                  <strong>Откуда забрать · {pickup.name}</strong>
                  <small>
                    {pickup.address ?? "Адрес точки выдачи не настроен"}
                  </small>
                </div>
              </div>
              {selected.activeOrders.length ? (
                selected.activeOrders.map((order, index) => (
                  <article className="delivery-stop" key={order.id}>
                    <span>{index + 1}</span>
                    <div>
                      <div className="delivery-stop-title">
                        <strong>Заказ #{order.number}</strong>
                        <b>{order.cashToCollect} TMT</b>
                      </div>
                      <p>{order.address}</p>
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
                          <li key={item.productName}>
                            {item.productName} × {item.quantity}
                          </li>
                        ))}
                      </ul>
                      {order.customerNote && (
                        <p className="customer-note">{order.customerNote}</p>
                      )}
                    </div>
                  </article>
                ))
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
