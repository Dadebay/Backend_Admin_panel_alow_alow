import { lazy, Suspense, useCallback, useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import { useForm } from "react-hook-form";
import { formatBranchDistance, useBranches } from "@/src/entities/branch";
import {
  canCancel,
  canAdministratorEditOrder,
  canEditCourierAssignment,
  kanbanQueueStatusesForRole,
  nextOrderStatus,
  orderTransitionActionLabel,
  previousOrderStatus,
  orderItemLabel,
  orderStatuses,
  ratingStars,
  roleCanUseOrderTable,
  statusLabels,
  useCouriers,
  useOrders,
  type Order,
  type OrderStatus,
} from "@/src/entities/order";
import { useOrderActions } from "@/src/features/order-management";
import { useReceiptPrinting } from "@/src/features/receipt-printing";
import { ApiError } from "@/src/shared/api/api-client";
import { useSession } from "@/src/shared/auth";
import { FormFieldError } from "@/src/shared/forms";
import { AsyncPanel, DataTable } from "@/src/shared/ui";
import {
  orderPeriodRange,
  todayDateValue,
  type OrderPeriod,
} from "../model/order-period-filter";
import {
  orderSearchFormSchema,
  type OrderSearchFormValues,
} from "../model/order-search-form";
import { OrderDetailDialog } from "./order-detail-dialog";
import { OrderKanban } from "./order-kanban";
import { OrderPackingChecklist } from "./order-packing-checklist";

const AssistedOrderDialog = lazy(() => import("@/src/widgets/assisted-order"));
const OrderCourierEditDialog = lazy(() =>
  import("@/src/features/order-management/editor").then((module) => ({
    default: module.OrderCourierEditDialog,
  })),
);
const OrderAdminEditDialog = lazy(() =>
  import("@/src/features/order-management/editor").then((module) => ({
    default: module.OrderAdminEditDialog,
  })),
);

const hourOptions = Array.from({ length: 25 }, (_, hour) => hour);

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
  description = "Две рабочие очереди, сегодняшние заказы и обновление каждые 30 секунд",
  defaultView = "kanban",
}: {
  fixedStatus?: OrderStatus;
  title?: string;
  description?: string;
  defaultView?: "table" | "kanban";
}) {
  const { session } = useSession();
  const role = session?.user.role ?? "CUSTOMER";
  const tableAllowed = roleCanUseOrderTable(role);
  const [requestedView, setRequestedView] = useState<"table" | "kanban">(
    defaultView,
  );
  const viewMode = tableAllowed ? requestedView : "kanban";
  const [status, setStatus] = useState<OrderStatus | "ALL">(
    fixedStatus ?? "ALL",
  );
  const [search, setSearch] = useState("");
  const [branchId, setBranchId] = useState("ALL");
  const [page, setPage] = useState(1);
  const [period, setPeriod] = useState<OrderPeriod>("today");
  const [selectedDate, setSelectedDate] = useState(todayDateValue);
  const [startHour, setStartHour] = useState(0);
  const [endHour, setEndHour] = useState(24);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
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
  const dateRange = useMemo(
    () =>
      orderPeriodRange({
        period,
        selectedDate,
        startHour,
        endHour,
      }),
    [endHour, period, selectedDate, startHour],
  );
  const orders = useOrders({
    status:
      fixedStatus ??
      (viewMode === "table" && status !== "ALL" ? status : undefined),
    statuses:
      !fixedStatus && viewMode === "kanban"
        ? kanbanQueueStatusesForRole(role)
        : undefined,
    branchId: branchId === "ALL" ? undefined : branchId,
    search,
    createdFrom: dateRange.createdFrom,
    createdTo: dateRange.createdTo,
    page,
    limit: viewMode === "kanban" ? 100 : 25,
  });
  const branches = useBranches();
  const couriers = useCouriers();
  const actions = useOrderActions();
  const receiptPrinting = useReceiptPrinting();
  const pending =
    actions.transition.isPending ||
    actions.assignCourier.isPending ||
    actions.confirmPacking.isPending ||
    actions.adminEdit.isPending ||
    actions.cancel.isPending ||
    receiptPrinting.isPending;
  const actionError =
    actions.transition.error ||
    actions.assignCourier.error ||
    actions.confirmPacking.error ||
    actions.adminEdit.error ||
    actions.cancel.error;

  const transitionOrder = useCallback(
    (order: Order, nextStatus: OrderStatus, note?: string) => {
      actions.transition.mutate({
        orderId: order.id,
        status: nextStatus,
        version: order.version,
        note,
      });
    },
    [actions.transition],
  );

  const rollbackOrder = useCallback(
    (order: Order, previousStatus: OrderStatus) => {
      const note = window.prompt("Причина возврата заказа на предыдущий этап");
      if (!note?.trim()) return;
      transitionOrder(order, previousStatus, note.trim());
    },
    [transitionOrder],
  );

  function submitSearch(values: OrderSearchFormValues) {
    setPage(1);
    setSearch(values.search);
  }

  const cancelOrder = useCallback(
    (order: Order) => {
      const reason = window.prompt("Причина отмены заказа");
      if (!reason?.trim()) return;
      actions.cancel.mutate(
        {
          orderId: order.id,
          reason: reason.trim(),
          version: order.version,
        },
      );
    },
    [actions.cancel],
  );

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
              <span
                className="customer-note order-customer-comment"
                data-testid={`order-table-note-${row.original.id}`}
              >
                Комментарий к заказу: {row.original.customerNote}
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
        cell: ({ row }) => {
          const order = row.original;
          const administratorIsPacking =
            ["COOKING", "READY"].includes(order.status) &&
            !order.packingConfirmedAt &&
            ["ADMIN", "SUPER_ADMIN"].includes(role);
          return (
            <div className="order-items-cell">
              {!administratorIsPacking &&
                order.items.map((item) => (
                  <span key={item.id}>
                    <b>{item.quantity}×</b> {orderItemLabel(item)}
                  </span>
                ))}
              <OrderPackingChecklist
                key={`${order.id}-${order.version}`}
                order={order}
                role={role}
                pending={pending}
                onConfirm={(packingOrder, checkedItemIds) =>
                  actions.confirmPacking.mutate({
                    orderId: packingOrder.id,
                    checkedItemIds,
                    version: packingOrder.version,
                  })
                }
              />
            </div>
          );
        },
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
          Boolean(row.original.packingConfirmedAt) &&
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
          const previous = previousOrderStatus(role, order.status);
          const courierId = courierByOrder[order.id];
          return (
            <div className="row-actions">
              <button
                type="button"
                className="secondary-button compact"
                data-testid={`order-table-details-${order.id}`}
                onClick={() => setSelectedOrderId(order.id)}
              >
                Подробнее
              </button>
              {order.status === "READY" &&
                order.packingConfirmedAt &&
                ["OPERATOR", "ADMIN", "SUPER_ADMIN"].includes(role) && (
                  <button
                    type="button"
                    className="primary-button compact"
                    data-testid={`order-table-assign-${order.id}`}
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
              {(canAdministratorEditOrder(role, order.status) ||
                canEditCourierAssignment(role, order.status)) && (
                <button
                  type="button"
                  className="secondary-button compact"
                  data-testid={`order-table-edit-${order.id}`}
                  disabled={pending}
                  onClick={() => setEditingOrder(order)}
                >
                  Редактировать
                </button>
              )}
              {previous && (
                <button
                  type="button"
                  className="secondary-button compact"
                  data-testid={`order-table-rollback-${order.id}`}
                  disabled={pending}
                  onClick={() => rollbackOrder(order, previous)}
                >
                  Вернуть: {statusLabels[previous]}
                </button>
              )}
              {next && (
                <button
                  type="button"
                  className="primary-button compact"
                  data-testid={`order-table-transition-${order.id}`}
                  disabled={pending}
                  onClick={() => transitionOrder(order, next)}
                >
                  {orderTransitionActionLabel(role, next)}
                </button>
              )}
              {["OPERATOR", "ADMIN", "SUPER_ADMIN"].includes(role) && (
                <button
                  type="button"
                  className="secondary-button compact"
                  data-testid={`order-table-print-${order.id}`}
                  disabled={receiptPrinting.isPending}
                  onClick={() => { if (window.confirm("Создать дополнительный чек? Сохранённые задания выполнятся автоматически.")) receiptPrinting.mutate(order.id); }}
                >
                  Печать
                </button>
              )}
              {canCancel(role, order.status) && (
                <button
                  type="button"
                  className="danger-button compact"
                  data-testid={`order-table-cancel-${order.id}`}
                  disabled={pending}
                  onClick={() => cancelOrder(order)}
                >
                  Отменить
                </button>
              )}
            </div>
          );
        },
      },
    ],
    [
      actions,
      cancelOrder,
      courierByOrder,
      couriers.data,
      pending,
      receiptPrinting,
      role,
      rollbackOrder,
      transitionOrder,
    ],
  );

  return (
    <section className="admin-section" data-testid="order-board">
      <header
        className="section-head orders-section-head"
        data-testid="orders-header"
      >
        <div>
          <span className="eyebrow">РЕАЛЬНЫЙ BACKEND</span>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <div
          className="header-actions section-header-actions orders-header-actions"
          data-testid="orders-header-actions"
        >
          {tableAllowed && (
            <div
              className="view-tabs order-view-tabs"
              role="tablist"
              aria-label="Вид заказов"
            >
              <button
                type="button"
                role="tab"
                className={viewMode === "kanban" ? "active" : ""}
                aria-selected={viewMode === "kanban"}
                data-testid="orders-view-kanban"
                onClick={() => {
                  setRequestedView("kanban");
                  setPage(1);
                }}
              >
                Доска
              </button>
              <button
                type="button"
                role="tab"
                className={viewMode === "table" ? "active" : ""}
                aria-selected={viewMode === "table"}
                data-testid="orders-view-table"
                onClick={() => {
                  setRequestedView("table");
                  setPage(1);
                }}
              >
                Таблица
              </button>
            </div>
          )}
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
            data-testid="orders-refresh"
            type="button"
            onClick={() => void orders.refetch()}
          >
            Обновить
          </button>
        </div>
      </header>

      {receiptPrinting.isPending && (
        <div className="order-print-status is-pending" role="status">
          Добавляем чек в очередь…
        </div>
      )}
      {receiptPrinting.isSuccess && (
        <div className="order-print-status is-success" role="status">
          Чек добавлен в очередь. Состояние отправки — в разделе «Печать» выше.
        </div>
      )}
      {receiptPrinting.isError && (
        <div className="order-print-status is-error" role="alert">
          Не удалось добавить чек: {receiptPrinting.error.message}
        </div>
      )}

      <div className="toolbar">
        <label>
          <span>Период</span>
          <select
            data-testid="orders-period-filter"
            value={period}
            onChange={(event) => {
              setPeriod(event.target.value as OrderPeriod);
              setPage(1);
            }}
          >
            <option value="today">Сегодня</option>
            <option value="yesterday">Вчера</option>
            <option value="date">Выбрать дату</option>
            <option value="all">Вся история</option>
          </select>
        </label>
        {period === "date" && (
          <label>
            <span>Дата</span>
            <input
              type="date"
              data-testid="orders-date-filter"
              max={todayDateValue()}
              value={selectedDate}
              onChange={(event) => {
                setSelectedDate(event.target.value);
                setPage(1);
              }}
            />
          </label>
        )}
        {period !== "all" && (
          <div className="order-hour-filters" aria-label="Фильтр по часам">
            <label>
              <span>С часа</span>
              <select
                data-testid="orders-hour-from-filter"
                value={startHour}
                onChange={(event) => {
                  const nextStart = Number(event.target.value);
                  setStartHour(nextStart);
                  if (nextStart >= endHour) {
                    setEndHour(Math.min(24, nextStart + 1));
                  }
                  setPage(1);
                }}
              >
                {hourOptions.slice(0, 24).map((hour) => (
                  <option value={hour} key={hour}>
                    {String(hour).padStart(2, "0")}:00
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>До часа</span>
              <select
                data-testid="orders-hour-to-filter"
                value={endHour}
                onChange={(event) => {
                  setEndHour(Number(event.target.value));
                  setPage(1);
                }}
              >
                {hourOptions
                  .filter((hour) => hour > startHour)
                  .map((hour) => (
                    <option value={hour} key={hour}>
                      {String(hour).padStart(2, "0")}:00
                    </option>
                  ))}
              </select>
            </label>
          </div>
        )}
        {!fixedStatus && viewMode === "table" && (
          <label>
            <span>Статус</span>
            <select
              data-testid="orders-status-filter"
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
        <div
          className={
            viewMode === "table" ? "table-card" : "order-board-results"
          }
        >
          {viewMode === "kanban" ? (
            <OrderKanban
              orders={orders.data?.items ?? []}
              role={role}
              fixedStatus={fixedStatus}
              couriers={couriers.data ?? []}
              courierByOrder={courierByOrder}
              pending={pending}
              onCourierChange={(orderId, courierId) =>
                setCourierByOrder((current) => ({
                  ...current,
                  [orderId]: courierId,
                }))
              }
              onAssignCourier={(order, courierId) =>
                actions.assignCourier.mutate({
                  orderId: order.id,
                  courierId,
                  version: order.version,
                })
              }
              onConfirmPacking={(order, checkedItemIds) =>
                actions.confirmPacking.mutate({
                  orderId: order.id,
                  checkedItemIds,
                  version: order.version,
                })
              }
              onTransition={transitionOrder}
              onPrintReceipt={(order) => { if (window.confirm("Создать дополнительный чек? Сохранённые задания выполнятся автоматически.")) receiptPrinting.mutate(order.id); }}
              onCancel={cancelOrder}
              onEditOrder={setEditingOrder}
              onOpenDetails={setSelectedOrderId}
            />
          ) : (
            <DataTable
              columns={columns}
              data={orders.data?.items ?? []}
              getRowId={(order) => order.id}
              empty="Заказов по выбранным условиям нет"
              label="Список заказов"
              minWidth={1180}
              variant="orders"
            />
          )}
          <footer className="table-pagination">
            <span>
              Показано: {orders.data?.items.length ?? 0} из{" "}
              {orders.data?.total ?? 0} · страница {orders.data?.page ?? page}{" "}
              из {orders.data?.pages || 1}
            </span>
            <div>
              <button
                type="button"
                className="secondary-button compact"
                data-testid="orders-page-previous"
                disabled={page <= 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                Назад
              </button>
              <button
                type="button"
                className="secondary-button compact"
                data-testid="orders-page-next"
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
      {editingOrder && (
        <Suspense
          fallback={<div className="async-state">Открываем редактор…</div>}
        >
          {role === "ADMIN" || role === "SUPER_ADMIN" ? (
            <OrderAdminEditDialog
              order={editingOrder}
              couriers={couriers.data ?? []}
              onClose={() => setEditingOrder(null)}
            />
          ) : (
            <OrderCourierEditDialog
              order={editingOrder}
              couriers={couriers.data ?? []}
              onClose={() => setEditingOrder(null)}
            />
          )}
        </Suspense>
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
