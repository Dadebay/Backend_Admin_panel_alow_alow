import { useCallback, useEffect, useRef, type Ref } from "react";
import { useSearchParams } from "react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import {
  useAccountingInspection,
  useAccountingOrder,
  useAccountingOrderAudit,
  type AccountingShift,
} from "@/src/entities/accounting";
import {
  orderStatuses,
  statusLabels,
  type OrderStatus,
} from "@/src/entities/order";
import { AsyncPanel } from "@/src/shared/ui";
import { FormFieldError } from "@/src/shared/forms";
import {
  auditActionLabels,
  inspectionMoney,
  inspectionSearchSchema,
  inspectionTime,
} from "../model/inspection";
import {
  EvidenceValue,
  InspectionAuditList,
  InspectionPagination,
} from "./inspection-audit";
import { InspectionOrders } from "./inspection-orders";
import { InspectionOverviewPanel } from "./inspection-overview";
import "./inspection.css";

const tabs = [
  ["overview", "Сводка и графики"],
  ["orders", "Все заказы"],
  ["in", "Из предыдущей смены"],
  ["out", "Следующей смене"],
  ["audit", "Журнал действий"],
] as const;
const pageNumber = (value: string | null) =>
  Math.max(1, Math.min(100000, Number(value) || 1));

export function AccountingInspection({
  fromDate,
  toDate,
  shifts,
  ref,
}: {
  fromDate: string;
  toDate: string;
  shifts: AccountingShift[];
  ref?: Ref<HTMLElement>;
}) {
  const [params, setParams] = useSearchParams();
  const update = useCallback(
    (values: Record<string, string | null>) =>
      setParams((previous) => {
        const next = new URLSearchParams(previous);
        for (const [key, value] of Object.entries(values)) {
          if (value) next.set(key, value);
          else next.delete(key);
        }
        return next;
      }),
    [setParams],
  );
  const tab = tabs.some(([key]) => key === params.get("inspection"))
    ? params.get("inspection")!
    : "overview";
  const shiftKey = params.get("shift") ?? "";
  const selected = shifts.find((shift) => shift.shiftKey === shiftKey);
  const page = pageNumber(params.get("inspectionPage"));
  const orderId = params.get("order");
  const detailRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (orderId) detailRef.current?.scrollIntoView({ block: "start" });
  }, [orderId]);
  const historyPage = pageNumber(params.get("historyPage"));
  const search = new URLSearchParams(
    shiftKey ? { shiftKey } : { fromDate, toDate },
  );
  const pageSearch = new URLSearchParams(search);
  pageSearch.set("page", String(page));
  pageSearch.set("limit", "25");
  const ordersSearch = new URLSearchParams(pageSearch);
  ordersSearch.set(
    "basis",
    params.get("orderBasis") === "cashReturned" ? "cashReturned" : "created",
  );
  const status = params.get("inspectionStatus");
  if (status && orderStatuses.includes(status as OrderStatus))
    ordersSearch.set("status", status);
  if (params.get("orderNumber"))
    ordersSearch.set("number", params.get("orderNumber")!);
  const auditSearch = new URLSearchParams(pageSearch);
  if (params.get("auditActor"))
    auditSearch.set("actorId", params.get("auditActor")!);
  if (params.get("auditAction"))
    auditSearch.set("action", params.get("auditAction")!);
  if (params.get("auditEntity"))
    auditSearch.set("entityType", params.get("auditEntity")!);
  const carrySearch = new URLSearchParams(pageSearch);
  carrySearch.set("direction", tab === "in" ? "in" : "out");
  const overview = useAccountingInspection(
    "overview",
    search.toString(),
    tab === "overview",
  );
  const orders = useAccountingInspection(
    "orders",
    ordersSearch.toString(),
    tab === "orders",
  );
  const audit = useAccountingInspection(
    "audit",
    auditSearch.toString(),
    tab === "audit",
  );
  const carryover = useAccountingInspection(
    "carryover",
    carrySearch.toString(),
    tab === "in" || tab === "out",
  );
  const detail = useAccountingOrder(orderId);
  const history = useAccountingOrderAudit(orderId, historyPage);
  const form = useForm<z.infer<typeof inspectionSearchSchema>>({
    resolver: zodResolver(inspectionSearchSchema),
    values: { number: params.get("orderNumber") ?? "" },
  });
  const openOrder = useCallback(
    (id: string) => update({ order: id, historyPage: null }),
    [update],
  );
  const onPage = (next: number) => update({ inspectionPage: String(next) });

  return (
    <section
      ref={ref}
      className="editor-card accounting-inspection"
      data-testid="accounting-inspection"
    >
      <header className="editor-title">
        <div>
          <h2>Контроль смен и действий</h2>
          <p>Заказы, деньги и история изменений. Часовой пояс: Ашхабад.</p>
        </div>
        <button
          className="secondary-button"
          type="button"
          data-testid="inspection-refresh"
          onClick={() => {
            if (tab === "overview") void overview.refetch();
            if (tab === "orders") void orders.refetch();
            if (tab === "audit") void audit.refetch();
            if (tab === "in" || tab === "out") void carryover.refetch();
            if (orderId) {
              void detail.refetch();
              void history.refetch();
            }
          }}
        >
          Обновить
        </button>
      </header>
      <label className="inspection-shift-label">
        Период проверки
        <select
          data-testid="inspection-shift"
          value={shiftKey}
          onChange={(event) =>
            update({
              shift: event.target.value,
              inspectionPage: null,
              order: null,
            })
          }
        >
          <option value="">
            Весь выбранный период: {fromDate} — {toDate}
          </option>
          {[...shifts].reverse().map((shift) => (
            <option key={shift.shiftKey} value={shift.shiftKey}>
              {shift.shiftName} · {inspectionTime(shift.periodStart)} —{" "}
              {inspectionTime(shift.periodEnd)}
            </option>
          ))}
        </select>
      </label>
      {selected && (
        <div className="inspection-shift-summary">
          <strong>{selected.shiftName}</strong>
          <span>
            Деньги за еду по системе: {inspectionMoney(selected.expectedAmount)}
          </span>
          <span>
            Ещё не передано бухгалтеру:{" "}
            {inspectionMoney(selected.availableAmount)}
          </span>
          {selected.handoff && (
            <>
              <span>
                Заявлено при сдаче:{" "}
                {inspectionMoney(selected.handoff.declaredAmount)}
              </span>
              <span>
                Расхождение:{" "}
                {inspectionMoney(
                  selected.handoff.declaredAmount -
                    selected.handoff.expectedAmount,
                )}
              </span>
              <span>
                Комментарий при сдаче: {selected.handoff.note || "Нет"}
              </span>
              <span>
                Проверка бухгалтера:{" "}
                {selected.handoff.confirmationNote || "Без комментария"}
              </span>
            </>
          )}
        </div>
      )}
      <div
        className="inspection-tabs"
        role="tablist"
        aria-label="Разделы контроля"
      >
        {tabs.map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            className={tab === key ? "primary-button" : "secondary-button"}
            type="button"
            data-testid={`inspection-tab-${key}`}
            onClick={() => update({ inspection: key, inspectionPage: null })}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "overview" && (
        <AsyncPanel
          pending={overview.isPending}
          error={overview.error}
          onRetry={() => void overview.refetch()}
        >
          {overview.data && (
            <InspectionOverviewPanel
              data={overview.data}
              onSelectDay={(date) =>
                update({
                  fromDate: date,
                  toDate: date,
                  shift: null,
                  inspectionPage: null,
                  order: null,
                  historyPage: null,
                })
              }
            />
          )}
        </AsyncPanel>
      )}
      {tab === "orders" && (
        <>
          <label className="inspection-shift-label">
            Какие заказы показать
            <select
              data-testid="inspection-order-basis"
              value={params.get("orderBasis") ?? "created"}
              onChange={(event) =>
                update({ orderBasis: event.target.value, inspectionPage: null })
              }
            >
              <option value="created">Созданные в этом периоде</option>
              <option value="cashReturned">
                Возврат денег в этом периоде / состав пакета смены
              </option>
            </select>
          </label>
          <form
            className="inspection-filters"
            data-testid="inspection-order-search"
            onSubmit={form.handleSubmit((value) =>
              update({ orderNumber: value.number, inspectionPage: null }),
            )}
          >
            <label>
              Номер заказа
              <input
                inputMode="numeric"
                data-testid="inspection-order-number"
                {...form.register("number")}
              />
              <FormFieldError message={form.formState.errors.number?.message} />
            </label>
            <button
              className="secondary-button"
              data-testid="inspection-order-find"
              type="submit"
            >
              Найти
            </button>
            <label>
              Статус
              <select
                value={status ?? ""}
                data-testid="inspection-order-status"
                onChange={(event) =>
                  update({
                    inspectionStatus: event.target.value,
                    inspectionPage: null,
                  })
                }
              >
                <option value="">Все статусы</option>
                {orderStatuses.map((value) => (
                  <option key={value} value={value}>
                    {statusLabels[value]}
                  </option>
                ))}
              </select>
            </label>
          </form>
          <AsyncPanel
            pending={orders.isPending}
            error={orders.error}
            onRetry={() => void orders.refetch()}
          >
            {orders.data && (
              <InspectionOrders
                data={orders.data}
                onOrder={openOrder}
                onPage={onPage}
              />
            )}
          </AsyncPanel>
        </>
      )}
      {(tab === "in" || tab === "out") && (
        <AsyncPanel
          pending={carryover.isPending}
          error={carryover.error}
          onRetry={() => void carryover.refetch()}
        >
          {carryover.data && (
            <div data-testid="inspection-carryover">
              <p>
                {carryover.data.isProvisional
                  ? "Предварительно, период ещё не закончился. Текущий срез"
                  : tab === "in"
                    ? "Незавершённые заказы на начало периода"
                    : "Незавершённые заказы на конец периода"}
                : {inspectionTime(carryover.data.boundary)}. Всего:{" "}
                <strong>{carryover.data.total}</strong>.
              </p>
              <p className="muted-text">
                Готовка, сборка, доставка и доставленные заказы без возврата
                денег. Один заказ может переходить через несколько смен;
                передача не создаёт повторное начисление.
              </p>
              {carryover.data.items.map((order) => (
                <article className="inspection-event" key={order.id}>
                  <div className="inspection-event-heading">
                    <div>
                      <strong>
                        №{order.number} · {statusLabels[order.statusAtBoundary]}
                      </strong>
                      <small>
                        Создан: {inspectionTime(order.createdAt)} · Сейчас:{" "}
                        {statusLabels[order.status]}
                      </small>
                    </div>
                    <button
                      type="button"
                      className="secondary-button"
                      data-testid={`inspection-carry-order-${order.id}`}
                      onClick={() => openOrder(order.id)}
                    >
                      История заказа
                    </button>
                  </div>
                  {order.historicalSnapshotAvailable ? (
                    <details>
                      <summary>
                        Состав, адрес и суммы на момент передачи
                      </summary>
                      <EvidenceValue value={order.snapshot} />
                    </details>
                  ) : (
                    <p className="inline-alert">
                      Для старого изменения не сохранён полный снимок состава.
                      Статус восстановлен по истории; актуальные сведения
                      доступны в заказе.
                    </p>
                  )}
                </article>
              ))}
              {!carryover.data.items.length && (
                <p className="async-state">Переходящих заказов нет.</p>
              )}
              <InspectionPagination
                {...carryover.data}
                onPage={onPage}
                prefix="inspection-carryover"
              />
            </div>
          )}
        </AsyncPanel>
      )}
      {tab === "audit" && (
        <>
          <div className="inspection-filters">
            <label>
              Действие
              <select
                data-testid="inspection-audit-action"
                value={params.get("auditAction") ?? ""}
                onChange={(event) =>
                  update({
                    auditAction: event.target.value,
                    inspectionPage: null,
                  })
                }
              >
                <option value="">Все действия</option>
                {Object.entries(auditActionLabels).map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Раздел
              <select
                data-testid="inspection-audit-entity"
                value={params.get("auditEntity") ?? ""}
                onChange={(event) =>
                  update({
                    auditEntity: event.target.value,
                    inspectionPage: null,
                  })
                }
              >
                <option value="">Все разделы</option>
                {[
                  "Order",
                  "Product",
                  "Category",
                  "Cafe",
                  "CashHandoff",
                  "AccountingSettings",
                  "User",
                  "Branch",
                  "PromoCode",
                  "Banner",
                  "ReceiptPrintTask",
                  "OperationsRequest",
                ].map((value) => (
                  <option key={value} value={value}>
                    {
                      (
                        {
                          Order: "Заказы",
                          Product: "Блюда",
                          Category: "Категории",
                          Cafe: "Кафе",
                          CashHandoff: "Сдача денег",
                          AccountingSettings: "Смены",
                          User: "Сотрудники",
                          Branch: "Филиалы",
                          PromoCode: "Промокоды",
                          Banner: "Баннеры",
                          ReceiptPrintTask: "Печать",
                          OperationsRequest: "Отклонённые запросы",
                        } as Record<string, string>
                      )[value]
                    }
                  </option>
                ))}
              </select>
            </label>
            {params.get("auditActor") && (
              <button
                type="button"
                className="secondary-button"
                data-testid="inspection-audit-clear-actor"
                onClick={() =>
                  update({ auditActor: null, inspectionPage: null })
                }
              >
                Показать всех сотрудников
              </button>
            )}
          </div>
          <p className="muted-text">
            Журнал показывает записанные действия по времени их выполнения.
            Откройте действие, чтобы сравнить изменения или отфильтровать
            автора.
          </p>
          <AsyncPanel
            pending={audit.isPending}
            error={audit.error}
            onRetry={() => void audit.refetch()}
          >
            {audit.data && (
              <InspectionAuditList
                data={audit.data}
                onPage={onPage}
                onOrder={openOrder}
                onActor={(id) =>
                  update({ auditActor: id, inspectionPage: null })
                }
              />
            )}
          </AsyncPanel>
        </>
      )}
      {orderId && (
        <section
          ref={detailRef}
          className="inspection-order-detail"
          data-testid="inspection-order-detail"
          aria-label="Проверка заказа"
        >
          <header className="editor-title">
            <h3>Заказ {detail.data ? `№${detail.data.number}` : ""}</h3>
            <button
              type="button"
              className="secondary-button"
              data-testid="inspection-order-close"
              onClick={() => update({ order: null, historyPage: null })}
            >
              Закрыть заказ
            </button>
          </header>
          <AsyncPanel
            pending={detail.isPending}
            error={detail.error}
            onRetry={() => void detail.refetch()}
          >
            {detail.data && (
              <>
                <p>
                  {statusLabels[detail.data.status]} ·{" "}
                  {inspectionTime(detail.data.createdAt)} ·{" "}
                  {detail.data.source === "STAFF_PHONE"
                    ? "Заказ по телефону"
                    : "Приложение"}
                </p>
                <p>
                  {detail.data.customerName} · {detail.data.customerPhone}
                </p>
                <p>
                  {detail.data.address} ·{" "}
                  {detail.data.deliveryEtrapName ?? "Район не определён"}
                </p>
                <p>Комментарий: {detail.data.customerNote || "Нет"}</p>
                <p>
                  Еда:{" "}
                  <strong>{inspectionMoney(detail.data.foodAmount)}</strong> ·
                  скидка: {inspectionMoney(detail.data.discount)} · доставка:{" "}
                  {inspectionMoney(detail.data.deliveryFee)} · всего:{" "}
                  {inspectionMoney(detail.data.total)}
                </p>
                {detail.data.cancellationReason && (
                  <p className="inline-alert">
                    Причина отмены: {detail.data.cancellationReason}
                  </p>
                )}
                <ul>
                  {detail.data.items.map((item) => (
                    <li key={item.id}>
                      {item.productName}
                      {item.variantName ? ` · ${item.variantName}` : ""} —{" "}
                      {item.quantity} × {inspectionMoney(item.unitPrice)} ={" "}
                      {inspectionMoney(item.lineTotal)} · готовка{" "}
                      {item.preparationMinutes} мин.
                    </li>
                  ))}
                </ul>
                <details>
                  <summary>Адресные детали, время этапов и подарки</summary>
                  <EvidenceValue
                    value={{
                      entrance: detail.data.entrance,
                      floor: detail.data.floor,
                      apartment: detail.data.apartment,
                      branchAddress: detail.data.branchAddress,
                      assignedAt: detail.data.assignedAt,
                      packingConfirmedAt: detail.data.packingConfirmedAt,
                      deliveredAt: detail.data.deliveredAt,
                      completedAt: detail.data.completedAt,
                      gifts: detail.data.gifts,
                      loyaltyPointsEarned: detail.data.loyaltyPointsEarned,
                      loyaltyPointsSpent: detail.data.loyaltyPointsSpent,
                      rating: detail.data.rating,
                    }}
                  />
                </details>
                <details>
                  <summary>Возврат и подтверждение денег</summary>
                  <EvidenceValue value={detail.data.settlement} />
                </details>
                <h4>Переходы статуса</h4>
                {!detail.data.transitions.length && <p>Переходов ещё нет.</p>}
                <ol className="inspection-timeline">
                  {detail.data.transitions.map((event) => (
                    <li key={event.id}>
                      <strong>
                        {statusLabels[event.fromStatus]} →{" "}
                        {statusLabels[event.toStatus]}
                      </strong>
                      <span>
                        {inspectionTime(event.createdAt)} ·{" "}
                        {[event.actor.firstName, event.actor.lastName]
                          .filter(Boolean)
                          .join(" ") || event.actor.id}
                      </span>
                      {event.note && <p>{event.note}</p>}
                    </li>
                  ))}
                </ol>
              </>
            )}
          </AsyncPanel>
          <h4>Полная история действий с заказом</h4>
          <AsyncPanel
            pending={history.isPending}
            error={history.error}
            onRetry={() => void history.refetch()}
          >
            {history.data && (
              <InspectionAuditList
                data={history.data}
                onPage={(value) => update({ historyPage: String(value) })}
              />
            )}
          </AsyncPanel>
        </section>
      )}
    </section>
  );
}
