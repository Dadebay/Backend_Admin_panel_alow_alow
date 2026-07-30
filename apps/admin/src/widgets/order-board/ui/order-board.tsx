import { useMemo, useState, type FormEvent } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import {
  canCancel,
  nextOrderStatus,
  orderStatuses,
  ratingStars,
  statusLabels,
  useCouriers,
  useOrders,
  type Order,
  type OrderStatus,
} from "@/src/entities/order";
import { useOrderActions } from "@/src/features/order-management";
import { ApiError } from "@/src/shared/api/api-client";
import { useSession } from "@/src/shared/auth";
import { AsyncPanel, DataTable } from "@/src/shared/ui";
import { OrderDetailDialog } from "./order-detail-dialog";

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

function mutationMessage(error: unknown) {
  if (!(error instanceof Error)) return "";
  if (error instanceof ApiError && error.status === 409) {
    return "Заказ уже изменён другим сотрудником. Данные обновляются.";
  }
  return error.message;
}

export function OrderBoard({
  fixedStatus,
  title = "Заказы",
  description = "Живая очередь из PostgreSQL, обновление каждые 12 секунд",
}: {
  fixedStatus?: OrderStatus;
  title?: string;
  description?: string;
}) {
  const { session } = useSession();
  const [status, setStatus] = useState<OrderStatus | "ALL">(
    fixedStatus ?? "ALL",
  );
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [courierByOrder, setCourierByOrder] = useState<Record<string, string>>(
    {},
  );
  const orders = useOrders({
    status: fixedStatus ?? (status === "ALL" ? undefined : status),
    search,
    page,
    limit: 25,
  });
  const couriers = useCouriers();
  const actions = useOrderActions();
  const role = session?.user.role ?? "CUSTOMER";
  const pending =
    actions.transition.isPending ||
    actions.assignCourier.isPending ||
    actions.cancel.isPending;
  const actionError =
    actions.transition.error ||
    actions.assignCourier.error ||
    actions.cancel.error;

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  const columns = useMemo<ColumnDef<Order, unknown>[]>(
    () => [
      {
        header: "Заказ",
        cell: ({ row }) => (
          <div className="primary-cell">
            <strong>#{row.original.number}</strong>
            <small>
              {new Intl.DateTimeFormat("ru-RU", {
                day: "2-digit",
                month: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              }).format(new Date(row.original.createdAt))}
            </small>
          </div>
        ),
      },
      {
        header: "Клиент и адрес",
        cell: ({ row }) => (
          <div className="primary-cell">
            <strong>{personName(row.original.customer)}</strong>
            <a href={`tel:${row.original.customer.phone}`}>
              {row.original.customer.phone}
            </a>
            <small>{row.original.address}</small>
          </div>
        ),
      },
      {
        header: "Состав",
        cell: ({ row }) => (
          <div className="order-items-cell">
            {row.original.items.map((item) => (
              <span key={item.id}>
                {item.productName} × {item.quantity}
              </span>
            ))}
          </div>
        ),
      },
      {
        header: "Сумма",
        cell: ({ row }) => (
          <strong>{Number(row.original.total).toFixed(2)} TMT</strong>
        ),
      },
      {
        header: "Статус",
        cell: ({ row }) => (
          <span
            className={`status-pill status-${row.original.status.toLowerCase()}`}
          >
            {statusLabels[row.original.status]}
          </span>
        ),
      },
      {
        header: "Отзыв",
        cell: ({ row }) =>
          row.original.rating ? (
            <button
              type="button"
              className="review-preview"
              aria-label={`Открыть отзыв к заказу ${row.original.number}`}
              onClick={() => setSelectedOrderId(row.original.id)}
            >
              <span aria-hidden="true">
                {ratingStars(row.original.rating.score)}
              </span>
              <small>
                {row.original.rating.comment?.trim() || "Без комментария"}
              </small>
            </button>
          ) : (
            <span className="muted">Нет отзыва</span>
          ),
      },
      {
        header: "Курьер",
        cell: ({ row }) =>
          row.original.status === "READY" &&
          ["OPERATOR", "ADMIN", "SUPER_ADMIN"].includes(role) ? (
            <select
              aria-label={`Курьер для заказа ${row.original.number}`}
              value={courierByOrder[row.original.id] ?? ""}
              onChange={(event) =>
                setCourierByOrder((current) => ({
                  ...current,
                  [row.original.id]: event.target.value,
                }))
              }
            >
              <option value="">Выберите</option>
              {(couriers.data ?? []).map((courier) => (
                <option key={courier.id} value={courier.id}>
                  {personName(courier)} · {courier.courierOrders.length} в работе
                </option>
              ))}
            </select>
          ) : row.original.courier ? (
            <div className="primary-cell">
              <strong>{personName(row.original.courier)}</strong>
              <small>{row.original.courier.phone}</small>
            </div>
          ) : (
            <span className="muted">Не назначен</span>
          ),
      },
      {
        id: "actions",
        header: "Действия",
        cell: ({ row }) => {
          const order = row.original;
          const next = nextOrderStatus(role, order.status);
          const courierId = courierByOrder[order.id];
          return (
            <div className="row-actions">
              <button
                type="button"
                className="secondary-button compact"
                onClick={() => setSelectedOrderId(order.id)}
              >
                Подробнее
              </button>
              {order.status === "READY" &&
                ["OPERATOR", "ADMIN", "SUPER_ADMIN"].includes(role) && (
                  <button
                    className="primary-button compact"
                    disabled={!courierId || pending}
                    onClick={() =>
                      actions.assignCourier.mutate({
                        orderId: order.id,
                        courierId,
                        version: order.version,
                      })
                    }
                  >
                    Отдать курьеру
                  </button>
                )}
              {next && (
                <button
                  className="primary-button compact"
                  disabled={pending}
                  onClick={() =>
                    actions.transition.mutate({
                      orderId: order.id,
                      status: next,
                      version: order.version,
                    })
                  }
                >
                  {statusLabels[next]}
                </button>
              )}
              {canCancel(role, order.status) && (
                <button
                  className="danger-button compact"
                  disabled={pending}
                  onClick={() => {
                    const reason = window.prompt("Причина отмены заказа");
                    if (!reason?.trim()) return;
                    actions.cancel.mutate({
                      orderId: order.id,
                      reason: reason.trim(),
                      version: order.version,
                    });
                  }}
                >
                  Отменить
                </button>
              )}
            </div>
          );
        },
      },
    ],
    [actions, courierByOrder, couriers.data, pending, role],
  );

  return (
    <section className="admin-section">
      <header className="section-head">
        <div>
          <span className="eyebrow">РЕАЛЬНЫЙ BACKEND</span>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <button
          className="secondary-button"
          onClick={() => void orders.refetch()}
        >
          Обновить
        </button>
      </header>

      <div className="toolbar">
        {!fixedStatus && (
          <label>
            <span>Статус</span>
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as OrderStatus | "ALL");
                setPage(1);
              }}
            >
              <option value="ALL">Все статусы</option>
              {orderStatuses.map((value) => (
                <option value={value} key={value}>
                  {statusLabels[value]}
                </option>
              ))}
            </select>
          </label>
        )}
        <form className="search-form" onSubmit={submitSearch}>
          <label>
            <span>Поиск</span>
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="№, телефон, имя или адрес"
            />
          </label>
          <button className="secondary-button" type="submit">
            Найти
          </button>
        </form>
      </div>

      {actionError && (
        <div className="inline-alert">{mutationMessage(actionError)}</div>
      )}

      <AsyncPanel
        pending={orders.isPending}
        error={orders.error}
        onRetry={() => void orders.refetch()}
      >
        <div className="table-card">
          <DataTable
            columns={columns}
            data={orders.data?.items ?? []}
            getRowId={(order) => order.id}
            empty="Заказов по выбранным условиям нет"
          />
          <footer className="table-pagination">
            <span>
              Всего: {orders.data?.total ?? 0} · страница{" "}
              {orders.data?.page ?? page} из {orders.data?.pages || 1}
            </span>
            <div>
              <button
                className="secondary-button compact"
                disabled={page <= 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                Назад
              </button>
              <button
                className="secondary-button compact"
                disabled={page >= (orders.data?.pages ?? 1)}
                onClick={() => setPage((value) => value + 1)}
              >
                Далее
              </button>
            </div>
          </footer>
        </div>
      </AsyncPanel>
      {selectedOrderId && (
        <OrderDetailDialog
          orderId={selectedOrderId}
          onClose={() => setSelectedOrderId(null)}
        />
      )}
    </section>
  );
}
