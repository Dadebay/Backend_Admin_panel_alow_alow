import { useMemo } from "react";
import {
  canCancel,
  kanbanLanesForRole,
  nextOrderStatus,
  orderItemLabel,
  orderCardFieldsForRole,
  roleCanUseOrderTable,
  statusLabels,
  type Courier,
  type Order,
  type OrderStatus,
  type Role,
} from "@/src/entities/order";

type OrderKanbanProps = {
  orders: Order[];
  role: Role;
  fixedStatus?: OrderStatus;
  couriers: Courier[];
  courierByOrder: Record<string, string>;
  pending: boolean;
  onCourierChange: (orderId: string, courierId: string) => void;
  onAssignCourier: (order: Order, courierId: string) => void;
  onTransition: (order: Order, status: OrderStatus) => void;
  onCancel: (order: Order) => void;
  onOpenDetails: (orderId: string) => void;
};

function personName(person: {
  firstName: string | null;
  lastName: string | null;
  phone?: string;
}) {
  return (
    [person.firstName, person.lastName].filter(Boolean).join(" ") ||
    person.phone ||
    "Без имени"
  );
}

function formatOrderTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function deliveryMeta(order: Order) {
  return [
    order.entrance && `подъезд ${order.entrance}`,
    order.floor && `этаж ${order.floor}`,
    order.apartment && `кв. ${order.apartment}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function OrderKanban({
  orders,
  role,
  fixedStatus,
  couriers,
  courierByOrder,
  pending,
  onCourierChange,
  onAssignCourier,
  onTransition,
  onCancel,
  onOpenDetails,
}: OrderKanbanProps) {
  const lanes = useMemo(
    () =>
      kanbanLanesForRole(role).filter(
        (lane) => !fixedStatus || lane.statuses.includes(fixedStatus),
      ),
    [fixedStatus, role],
  );
  const fields = orderCardFieldsForRole(role);
  const canOpenDetails = roleCanUseOrderTable(role);
  const ordersByLane = useMemo(
    () =>
      lanes.map((lane) => ({
        lane,
        orders: orders.filter((order) => lane.statuses.includes(order.status)),
      })),
    [lanes, orders],
  );

  return (
    <div
      className="order-kanban"
      data-testid="order-kanban"
      aria-label="Канбан-доска заказов"
    >
      {ordersByLane.map(({ lane, orders: laneOrders }) => (
        <section
          className={`order-kanban-lane order-kanban-lane--${lane.id}`}
          data-testid={`order-kanban-column-${lane.id}`}
          key={lane.id}
          aria-labelledby={`order-kanban-title-${lane.id}`}
        >
          <header className="order-kanban-lane-head">
            <div>
              <span>{lane.responsibility}</span>
              <h2 id={`order-kanban-title-${lane.id}`}>{lane.title}</h2>
            </div>
            <strong aria-label={`${laneOrders.length} заказов`}>
              {laneOrders.length}
            </strong>
          </header>

          <div className="order-kanban-cards">
            {laneOrders.length === 0 && (
              <p className="order-kanban-empty">В этой колонке заказов нет</p>
            )}
            {laneOrders.map((order) => {
              const next = nextOrderStatus(role, order.status);
              const selectedCourier = courierByOrder[order.id] ?? "";
              const meta = deliveryMeta(order);
              const canAssign =
                order.status === "READY" &&
                ["OPERATOR", "ADMIN", "SUPER_ADMIN"].includes(role);

              return (
                <article
                  className="order-kanban-card"
                  data-testid={`order-kanban-card-${order.id}`}
                  key={order.id}
                >
                  <div className="order-kanban-card-head">
                    <div>
                      <strong>#{order.number}</strong>
                      <time dateTime={order.createdAt}>
                        {formatOrderTime(order.createdAt)}
                      </time>
                    </div>
                    <span
                      className={`status-pill status-${order.status.toLowerCase()}`}
                    >
                      {statusLabels[order.status]}
                    </span>
                  </div>

                  {order.source === "STAFF_PHONE" && (
                    <span className="order-source-label">
                      Заказ по телефону
                    </span>
                  )}

                  {fields.has("customer") && (
                    <div className="order-kanban-person">
                      <span>Клиент</span>
                      <strong>{personName(order.customer)}</strong>
                      <a href={`tel:${order.customer.phone}`}>
                        {order.customer.phone}
                      </a>
                    </div>
                  )}

                  {fields.has("delivery") && (
                    <div className="order-kanban-address">
                      <span>Куда доставить</span>
                      <strong>{order.address}</strong>
                      {meta && <small>{meta}</small>}
                    </div>
                  )}

                  {fields.has("branch") && (
                    <div className="order-kanban-meta">
                      <span>Филиал</span>
                      <strong>{order.branchName ?? "Старый заказ"}</strong>
                    </div>
                  )}

                  {fields.has("items") && (
                    <ul
                      className="order-kanban-items"
                      aria-label="Состав заказа"
                    >
                      {order.items.map((item) => (
                        <li key={item.id}>
                          <b>{item.quantity}×</b>
                          <span>{orderItemLabel(item)}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {order.customerNote &&
                    (role === "COOK" || fields.has("delivery")) && (
                      <p className="order-kanban-note">
                        <strong>Комментарий:</strong> {order.customerNote}
                      </p>
                    )}

                  {order.cancellationReason && canOpenDetails && (
                    <p className="order-kanban-note">
                      <strong>Причина отмены:</strong>{" "}
                      {order.cancellationReason}
                    </p>
                  )}

                  <div className="order-kanban-finance">
                    {fields.has("cash") && (
                      <div>
                        <span>Наличными</span>
                        <strong>{Number(order.total).toFixed(2)} TMT</strong>
                      </div>
                    )}
                    {fields.has("courier") && order.courier && (
                      <div>
                        <span>Курьер</span>
                        <strong>{personName(order.courier)}</strong>
                      </div>
                    )}
                  </div>

                  {canAssign && (
                    <label className="order-kanban-courier">
                      <span>Назначить курьера</span>
                      <select
                        data-testid={`order-kanban-courier-${order.id}`}
                        aria-label={`Курьер для заказа ${order.number}`}
                        value={selectedCourier}
                        onChange={(event) =>
                          onCourierChange(order.id, event.target.value)
                        }
                      >
                        <option value="">Выберите курьера</option>
                        {couriers.map((courier) => (
                          <option key={courier.id} value={courier.id}>
                            {personName(courier)} ·{" "}
                            {courier.courierOrders.length} в работе
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  <div className="order-kanban-actions">
                    {canOpenDetails && (
                      <button
                        type="button"
                        className="secondary-button compact"
                        data-testid={`order-kanban-details-${order.id}`}
                        onClick={() => onOpenDetails(order.id)}
                      >
                        Подробнее
                      </button>
                    )}
                    {canAssign && (
                      <button
                        type="button"
                        className="primary-button compact"
                        data-testid={`order-kanban-assign-${order.id}`}
                        disabled={!selectedCourier || pending}
                        onClick={() => onAssignCourier(order, selectedCourier)}
                      >
                        Отдать курьеру
                      </button>
                    )}
                    {next && (
                      <button
                        type="button"
                        className="primary-button compact"
                        data-testid={`order-kanban-transition-${order.id}`}
                        disabled={pending}
                        onClick={() => onTransition(order, next)}
                      >
                        {statusLabels[next]}
                      </button>
                    )}
                    {canCancel(role, order.status) && (
                      <button
                        type="button"
                        className="danger-button compact"
                        data-testid={`order-kanban-cancel-${order.id}`}
                        disabled={pending}
                        onClick={() => onCancel(order)}
                      >
                        Отменить
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
