import { lazy, Suspense, useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import { useForm } from "react-hook-form";
import { formatBranchDistance, useBranches } from "@/src/entities/branch";
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
import { FormFieldError } from "@/src/shared/forms";
import { AsyncPanel, DataTable } from "@/src/shared/ui";
import {
  orderSearchFormSchema,
  type OrderSearchFormValues,
} from "../model/order-search-form";
import { OrderDetailDialog } from "./order-detail-dialog";

const AssistedOrderDialog = lazy(() => import("@/src/widgets/assisted-order"));

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

function formatOrderDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function deliveryDetails(order: Order) {
  const details = [
    order.entrance && `подъезд ${order.entrance}`,
    order.floor && `этаж ${order.floor}`,
    order.apartment && `кв. ${order.apartment}`,
  ].filter(Boolean);

  return details.join(" · ");
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
  const [search, setSearch] = useState("");
  const [branchId, setBranchId] = useState("ALL");
  const [page, setPage] = useState(1);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [showAssistedOrder, setShowAssistedOrder] = useState(false);
  const [courierByOrder, setCourierByOrder] = useState<Record<string, string>>(
    {},
  );
  const {
    register: registerSearch,
    handleSubmit: handleSearchSubmit,
    formState: { errors: searchErrors },
  } = useForm<OrderSearchFormValues>({
    resolver: zodResolver(orderSearchFormSchema),
    defaultValues: { search: "" },
  });
  const orders = useOrders({
    status: fixedStatus ?? (status === "ALL" ? undefined : status),
    branchId: branchId === "ALL" ? undefined : branchId,
    search,
    page,
    limit: 25,
  });
  const branches = useBranches();
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

  function submitSearch(values: OrderSearchFormValues) {
    setPage(1);
    setSearch(values.search);
  }

  const columns = useMemo<ColumnDef<Order, unknown>[]>(
    () => [
      {
        header: "Заказ",
        cell: ({ row }) => (
          <div className="primary-cell order-identity">
            <div className="order-identity-head">
              <strong>#{row.original.number}</strong>
              <span
                className={`status-pill status-${row.original.status.toLowerCase()}`}
              >
                {statusLabels[row.original.status]}
              </span>
            </div>
            <small>{formatOrderDate(row.original.createdAt)}</small>
            {row.original.source === "STAFF_PHONE" && (
              <span className="order-source-label">Заказ по телефону</span>
            )}
            <span className="order-item-count">
              {row.original.items.length} позиций
            </span>
            {row.original.cancellationReason && (
              <span className="order-cancellation-reason">
                Причина отмены: {row.original.cancellationReason}
              </span>
            )}
          </div>
        ),
      },
      {
        header: "Клиент и адрес",
        cell: ({ row }) => (
          <div className="primary-cell customer-address-cell">
            <strong>{personName(row.original.customer)}</strong>
            <a href={`tel:${row.original.customer.phone}`}>
              {row.original.customer.phone}
            </a>
            <small className="address-copy">{row.original.address}</small>
            {deliveryDetails(row.original) && (
              <span className="delivery-details">
                {deliveryDetails(row.original)}
              </span>
            )}
            {row.original.customerNote && (
              <span className="customer-note" title={row.original.customerNote}>
                Примечание: {row.original.customerNote}
              </span>
            )}
          </div>
        ),
      },
      {
        header: "Филиал",
        cell: ({ row }) => (
          <div className="primary-cell">
            <strong>{row.original.branchName ?? "Старый заказ"}</strong>
            {row.original.branchDistanceMeters !== null && (
              <small>
                {formatBranchDistance(row.original.branchDistanceMeters)} до
                клиента
              </small>
            )}
          </div>
        ),
      },
      {
        header: "Состав",
        cell: ({ row }) => (
          <div className="order-items-cell">
            {row.original.items.map((item) => (
              <span key={item.id}>
                <b>{item.quantity}×</b> {item.productName}
              </span>
            ))}
          </div>
        ),
      },
      {
        header: "Оплата",
        cell: ({ row }) => (
          <div className="amount-cell">
            <strong>{Number(row.original.total).toFixed(2)} TMT</strong>
            <small>Наличными</small>
            {Number(row.original.deliveryFee) > 0 && (
              <span>
                Доставка: {Number(row.original.deliveryFee).toFixed(2)} TMT
              </span>
            )}
          </div>
        ),
      },
      {
        header: "Статус",
        cell: ({ row }) =>
          row.original.cancellationReason ? (
            <div className="status-context">
              <span
                className={`status-pill status-${row.original.status.toLowerCase()}`}
              >
                {statusLabels[row.original.status]}
              </span>
              <small title={row.original.cancellationReason}>
                {row.original.cancellationReason}
              </small>
            </div>
          ) : (
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
                  {personName(courier)} · {courier.courierOrders.length} в
                  работе
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
        <div className="header-actions">
          {["OPERATOR", "ADMIN", "SUPER_ADMIN"].includes(role) && (
            <button
              className="primary-button"
              data-testid="assisted-order-open"
              type="button"
              onClick={() => setShowAssistedOrder(true)}
            >
              + Заказ по звонку
            </button>
          )}
          <button
            className="secondary-button"
            type="button"
            onClick={() => void orders.refetch()}
          >
            Обновить
          </button>
        </div>
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
        <label>
          <span>Филиал</span>
          <select
            data-testid="orders-branch-filter"
            value={branchId}
            onChange={(event) => {
              setBranchId(event.target.value);
              setPage(1);
            }}
          >
            <option value="ALL">Все филиалы</option>
            {(branches.data ?? []).map((branch) => (
              <option value={branch.id} key={branch.id}>
                {branch.name}
                {branch.isActive ? "" : " (отключён)"}
              </option>
            ))}
          </select>
        </label>
        <form
          className="search-form"
          data-testid="orders-search-form"
          noValidate
          onSubmit={handleSearchSubmit(submitSearch)}
        >
          <label>
            <span>Поиск</span>
            <input
              data-testid="orders-search-input"
              {...registerSearch("search")}
              aria-invalid={Boolean(searchErrors.search)}
              placeholder="№, телефон, имя или адрес"
            />
            <FormFieldError message={searchErrors.search?.message} />
          </label>
          <button
            className="secondary-button"
            data-testid="orders-search-submit"
            type="submit"
          >
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
            label="Список заказов"
            minWidth={1180}
            variant="orders"
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
      {showAssistedOrder && (
        <Suspense
          fallback={<div className="async-state">Открываем форму заказа…</div>}
        >
          <AssistedOrderDialog onClose={() => setShowAssistedOrder(false)} />
        </Suspense>
      )}
    </section>
  );
}
