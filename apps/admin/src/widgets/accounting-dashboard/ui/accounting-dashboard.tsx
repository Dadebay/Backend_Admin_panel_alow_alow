import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { AccountingInspection } from "./accounting-inspection";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import {
  type AccountingShift,
  useAccountingReport,
  useAccountingSettings,
  useAccountingShifts,
} from "@/src/entities/accounting";
import { useMyAdminPageAccess } from "@/src/entities/admin-page-access";
import { useAccountingActions } from "@/src/features/accounting-management";
import { FormFieldError } from "@/src/shared/forms";
import { useSession } from "@/src/shared/auth";
import { AsyncPanel } from "@/src/shared/ui";
import {
  accountingRangeSchema,
  accountingMonthSchema,
  accountingMonthRange,
  accountingSettingsSchema,
  cashHandoffSchema,
  type AccountingRangeValues,
  type AccountingSettingsValues,
  type CashHandoffValues,
} from "../model/accounting-forms";

function ashgabatDate(value = new Date()) {
  return new Date(value.getTime() + 5 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

function offsetDate(value: string, days: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function money(value: number) {
  return (
    new Intl.NumberFormat("ru-RU", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value) + " TMT"
  );
}

function periodLabel(start: string, end: string) {
  const formatter = new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Asia/Ashgabat",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${formatter.format(new Date(start))} — ${formatter.format(new Date(end))}`;
}

const stateLabels: Record<AccountingShift["state"], string> = {
  OPEN: "Смена идёт",
  EMPTY: "Нет денег к сдаче",
  READY: "Готово к сдаче",
  SUBMITTED: "Передано бухгалтеру",
  CONFIRMED: "Подтверждено",
};

function actorName(
  actor: AccountingShift["handoff"] extends infer H
    ? H extends { submittedBy: infer A }
      ? A
      : never
    : never,
) {
  if (!actor || typeof actor !== "object") return "—";
  const value = [actor.firstName, actor.lastName].filter(Boolean).join(" ");
  return value || "Сотрудник";
}

export function AccountingDashboard() {
  const { session } = useSession();
  const inspectionRef = useRef<HTMLElement>(null);
  const pageAccess = useMyAdminPageAccess();
  const role = session?.user.role;
  const hasExpandedAccess = Boolean(
    pageAccess.data?.expandedPages.includes("ACCOUNTING"),
  );
  const isAdmin =
    role === "ADMIN" || role === "SUPER_ADMIN" || hasExpandedAccess;
  const canSeeReport =
    role === "ACCOUNTANT" || role === "SUPER_ADMIN" || hasExpandedAccess;
  const isSuperAdmin = role === "SUPER_ADMIN";
  const today = ashgabatDate();
  const [params, setParams] = useSearchParams();
  const range = {
    fromDate: params.get("fromDate") ?? offsetDate(today, -6),
    toDate: params.get("toDate") ?? today,
  };
  function setRange(value: AccountingRangeValues) {
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set("fromDate", value.fromDate);
      next.set("toDate", value.toDate);
      for (const key of ["shift", "inspectionPage", "order", "historyPage"])
        next.delete(key);
      return next;
    });
    setSelectedShift(null);
  }
  const [selectedShift, setSelectedShift] = useState<AccountingShift | null>(
    null,
  );
  const settings = useAccountingSettings();
  const shifts = useAccountingShifts(range.fromDate, range.toDate);
  const report = useAccountingReport(
    range.fromDate,
    range.toDate,
    hasExpandedAccess,
  );
  const actions = useAccountingActions();
  const rangeForm = useForm<AccountingRangeValues>({
    resolver: zodResolver(accountingRangeSchema),
    values: range,
  });
  const monthForm = useForm<{ month: string }>({
    resolver: zodResolver(accountingMonthSchema),
    defaultValues: { month: today.slice(0, 7) },
  });
  const settingsForm = useForm<AccountingSettingsValues>({
    resolver: zodResolver(accountingSettingsSchema),
    defaultValues: {
      firstShiftName: "",
      firstShiftStart: "09:30",
      secondShiftName: "",
      secondShiftStart: "19:00",
    },
  });
  const handoffForm = useForm<CashHandoffValues>({
    resolver: zodResolver(cashHandoffSchema),
    defaultValues: { declaredAmount: 0, note: "" },
  });

  useEffect(() => {
    if (!settings.data || settingsForm.formState.isDirty) return;
    settingsForm.reset({
      firstShiftName: settings.data.firstShiftName,
      firstShiftStart: settings.data.firstShiftStart,
      secondShiftName: settings.data.secondShiftName,
      secondShiftStart: settings.data.secondShiftStart,
    });
  }, [settings.data, settingsForm]);

  useEffect(() => {
    if (!selectedShift) return;
    handoffForm.reset({
      declaredAmount: selectedShift.availableAmount,
      note: "",
    });
  }, [handoffForm, selectedShift]);

  function applyPreset(days: number) {
    const value = { fromDate: offsetDate(today, -(days - 1)), toDate: today };
    rangeForm.reset(value);
    setRange(value);
  }

  async function submitHandoff(values: CashHandoffValues) {
    if (!selectedShift) return;
    await actions.submitHandoff.mutateAsync({
      shiftKey: selectedShift.shiftKey,
      declaredAmount: values.declaredAmount,
      note: values.note || undefined,
    });
    setSelectedShift(null);
  }

  async function updateSettings(values: AccountingSettingsValues) {
    await actions.updateSettings.mutateAsync(values);
    settingsForm.reset(values);
  }

  const maxDaily = Math.max(
    1,
    ...(report.data?.daily.map(({ amount }) => amount) ?? []),
  );

  return (
    <section
      className="admin-section accounting-dashboard"
      data-testid="accounting-dashboard"
    >
      <header className="section-head">
        <div>
          <h1>Деньги за еду по сменам</h1>
          <p>
            Администратор сдаёт стоимость еды после скидок. Доставка в
            бухгалтерскую сумму не входит.
          </p>
        </div>
      </header>

      <form
        className="accounting-range editor-card"
        data-testid="accounting-month-form"
        onSubmit={monthForm.handleSubmit(({ month }) =>
          setRange(accountingMonthRange(month)),
        )}
      >
        <label>
          Полный календарный месяц
          <input
            type="month"
            data-testid="accounting-month"
            {...monthForm.register("month")}
          />
          <FormFieldError message={monthForm.formState.errors.month?.message} />
        </label>
        <button
          type="submit"
          className="primary-button"
          data-testid="accounting-month-apply"
        >
          Отчёт за месяц
        </button>
      </form>

      <form
        className="accounting-range editor-card"
        data-testid="accounting-range-form"
        onSubmit={rangeForm.handleSubmit(setRange)}
      >
        <div className="accounting-presets" aria-label="Быстрый период">
          <button type="button" onClick={() => applyPreset(1)}>
            Сегодня
          </button>
          <button type="button" onClick={() => applyPreset(7)}>
            7 дней
          </button>
          <button type="button" onClick={() => applyPreset(30)}>
            30 дней
          </button>
        </div>
        <label>
          С даты
          <input type="date" {...rangeForm.register("fromDate")} />
          <FormFieldError
            message={rangeForm.formState.errors.fromDate?.message}
          />
        </label>
        <label>
          По дату
          <input type="date" {...rangeForm.register("toDate")} />
          <FormFieldError
            message={rangeForm.formState.errors.toDate?.message}
          />
        </label>
        <button className="secondary-button" type="submit">
          Показать
        </button>
      </form>

      {canSeeReport && (
        <div className="accounting-financial-report">
          <AsyncPanel
            pending={report.isPending}
            error={report.error}
            onRetry={() => void report.refetch()}
          >
            {report.data && (
              <>
                <div
                  className="accounting-metrics"
                  data-testid="accounting-summary"
                >
                  <article>
                    <span>Получено за еду</span>
                    <strong>
                      {money(report.data.summary.collectedAmount)}
                    </strong>
                    <small>
                      {report.data.summary.completedOrders} заказов · без
                      доставки
                    </small>
                  </article>
                  <article>
                    <span>Передано бухгалтеру</span>
                    <strong>
                      {money(report.data.summary.submittedAmount)}
                    </strong>
                    <small>только еда</small>
                  </article>
                  <article>
                    <span>Подтверждено</span>
                    <strong>
                      {money(report.data.summary.confirmedAmount)}
                    </strong>
                    <small>еда, сверенная бухгалтером</small>
                  </article>
                  <article
                    className={
                      report.data.summary.outstandingAmount
                        ? "needs-action"
                        : ""
                    }
                  >
                    <span>Осталось сдать</span>
                    <strong>
                      {money(report.data.summary.outstandingAmount)}
                    </strong>
                    <small>за еду, без доставки</small>
                  </article>
                  <article>
                    <span>Средний заказ еды</span>
                    <strong>
                      {money(report.data.summary.averageOrderAmount)}
                    </strong>
                    <small>после скидок, без доставки</small>
                  </article>
                  <article>
                    <span>Отказы</span>
                    <strong>{report.data.summary.cancelledOrders}</strong>
                    <small>
                      {report.data.summary.cancellationRate}% от созданных в
                      периоде заказов
                    </small>
                  </article>
                  <article>
                    <span>Заявлено при сдаче</span>
                    <strong>
                      {money(report.data.summary.declaredHandoffAmount)}
                    </strong>
                    <small>по пакетам смен, начавшихся в периоде</small>
                  </article>
                  <article
                    className={
                      report.data.summary.handoffDiscrepancy
                        ? "needs-action"
                        : ""
                    }
                  >
                    <span>Расхождение по пакетам</span>
                    <strong>
                      {money(report.data.summary.handoffDiscrepancy)}
                    </strong>
                    <small>
                      заявлено минус сумма по системе; минус — недостача
                    </small>
                  </article>
                </div>

                <section
                  className="editor-card accounting-chart"
                  data-testid="accounting-daily-report"
                >
                  <div className="editor-title">
                    <div>
                      <h2>Выручка от еды по дням</h2>
                      <p>Без доставки · часовой пояс Asia/Ashgabat</p>
                    </div>
                  </div>
                  <div className="accounting-bars">
                    {report.data.daily.map((day) => (
                      <div className="accounting-bar-row" key={day.date}>
                        <time dateTime={day.date}>
                          {day.date.slice(5).split("-").reverse().join(".")}
                        </time>
                        <div>
                          <span
                            style={{
                              width: `${Math.max(2, (day.amount / maxDaily) * 100)}%`,
                            }}
                          />
                        </div>
                        <strong>{money(day.amount)}</strong>
                        <small>{day.orderCount} зак.</small>
                      </div>
                    ))}
                  </div>
                </section>
              </>
            )}
          </AsyncPanel>
        </div>
      )}

      {(role === "ACCOUNTANT" || isSuperAdmin) && (
        <AccountingInspection
          ref={inspectionRef}
          fromDate={range.fromDate}
          toDate={range.toDate}
          shifts={shifts.data ?? []}
        />
      )}

      <AsyncPanel
        pending={shifts.isPending}
        error={shifts.error}
        onRetry={() => void shifts.refetch()}
      >
        <section
          className="editor-card accounting-shifts"
          data-testid="accounting-shifts"
        >
          <div className="editor-title">
            <div>
              <h2>
                {isAdmin
                  ? "Суммы за еду к сдаче"
                  : "Пакеты еды на подтверждение"}
              </h2>
              <p>
                Доставка исключена. Границы смен не меняют уже созданные пакеты.
              </p>
            </div>
          </div>
          <div className="accounting-shift-grid">
            {[...(shifts.data ?? [])].reverse().map((shift) => (
              <article
                className={`accounting-shift-card state-${shift.state.toLowerCase()}`}
                data-testid={`accounting-shift-${shift.shiftKey}`}
                key={shift.shiftKey}
              >
                <div className="accounting-shift-title">
                  <div>
                    <strong>{shift.shiftName}</strong>
                    <small>
                      {periodLabel(shift.periodStart, shift.periodEnd)}
                    </small>
                  </div>
                  <span>{stateLabels[shift.state]}</span>
                </div>
                <dl>
                  <div>
                    <dt>Еда по системе</dt>
                    <dd>{money(shift.expectedAmount)}</dd>
                  </div>
                  <div>
                    <dt>Заказов</dt>
                    <dd>{shift.settlementCount}</dd>
                  </div>
                </dl>
                {shift.handoff && (
                  <div className="accounting-handoff-detail">
                    <span>
                      Заявлено:{" "}
                      <strong>{money(shift.handoff.declaredAmount)}</strong>
                    </span>
                    <span>Сдал: {actorName(shift.handoff.submittedBy)}</span>
                    {shift.handoff.declaredAmount !==
                      shift.handoff.expectedAmount && (
                      <b>
                        Разница:{" "}
                        {money(
                          shift.handoff.declaredAmount -
                            shift.handoff.expectedAmount,
                        )}
                      </b>
                    )}
                  </div>
                )}
                {(role === "ACCOUNTANT" || isSuperAdmin) && (
                  <button
                    className="secondary-button"
                    data-testid={`accounting-inspect-${shift.shiftKey}`}
                    type="button"
                    onClick={() => {
                      setParams((previous) => {
                        const next = new URLSearchParams(previous);
                        next.set("shift", shift.shiftKey);
                        next.set("inspection", "overview");
                        for (const key of [
                          "inspectionPage",
                          "order",
                          "historyPage",
                          "inspectionStatus",
                          "orderNumber",
                          "auditActor",
                          "auditAction",
                          "auditEntity",
                        ])
                          next.delete(key);
                        return next;
                      });
                      inspectionRef.current?.scrollIntoView({ block: "start" });
                    }}
                  >
                    Проверить смену
                  </button>
                )}
                {isAdmin && shift.canSubmit && (
                  <button
                    className="primary-button"
                    data-testid={`accounting-submit-${shift.shiftKey}`}
                    type="button"
                    onClick={() => setSelectedShift(shift)}
                  >
                    Сдать {money(shift.availableAmount)}
                  </button>
                )}
                {canSeeReport && shift.handoff?.status === "SUBMITTED" && (
                  <button
                    className="primary-button"
                    data-testid={`accounting-confirm-${shift.shiftKey}`}
                    disabled={actions.confirmHandoff.isPending}
                    type="button"
                    onClick={() =>
                      void actions.confirmHandoff.mutateAsync({
                        id: shift.handoff!.id,
                        body: {},
                      })
                    }
                  >
                    {actions.confirmHandoff.isPending
                      ? "Подтверждаем…"
                      : "Подтвердить деньги"}
                  </button>
                )}
              </article>
            ))}
          </div>
          {!shifts.data?.length && (
            <p className="async-state">За выбранный период смен нет.</p>
          )}
        </section>
      </AsyncPanel>

      {selectedShift && (
        <form
          className="editor-card accounting-handoff-form"
          data-testid="accounting-handoff-form"
          onSubmit={handoffForm.handleSubmit(submitHandoff)}
        >
          <div className="editor-title">
            <div>
              <h2>Сдать «{selectedShift.shiftName}»</h2>
              <p>
                {periodLabel(
                  selectedShift.periodStart,
                  selectedShift.periodEnd,
                )}
              </p>
            </div>
            <button
              className="secondary-button"
              type="button"
              onClick={() => setSelectedShift(null)}
            >
              Закрыть
            </button>
          </div>
          <div className="form-grid">
            <label>
              Фактически передаёте, TMT
              <input
                type="number"
                step="0.01"
                {...handoffForm.register("declaredAmount", {
                  valueAsNumber: true,
                })}
              />
              <FormFieldError
                message={handoffForm.formState.errors.declaredAmount?.message}
              />
            </label>
            <label className="wide-field">
              Комментарий при расхождении
              <textarea rows={3} {...handoffForm.register("note")} />
              <FormFieldError
                message={handoffForm.formState.errors.note?.message}
              />
            </label>
          </div>
          {actions.submitHandoff.error && (
            <div className="inline-alert" role="alert">
              {actions.submitHandoff.error instanceof Error
                ? actions.submitHandoff.error.message
                : "Не удалось сдать смену."}
            </div>
          )}
          <button
            className="primary-button"
            disabled={actions.submitHandoff.isPending}
            type="submit"
          >
            {actions.submitHandoff.isPending
              ? "Передаём…"
              : "Передать бухгалтеру"}
          </button>
        </form>
      )}

      {actions.confirmHandoff.error && (
        <div className="inline-alert" role="alert">
          {actions.confirmHandoff.error instanceof Error
            ? actions.confirmHandoff.error.message
            : "Не удалось подтвердить пакет."}
        </div>
      )}

      {canSeeReport && report.data && (
        <section
          className="editor-card accounting-products"
          data-testid="accounting-products"
        >
          <div className="editor-title">
            <div>
              <h2>Ходовые блюда в возвращённых деньгах</h2>
              <p>
                10 самых частых блюд. Суммы строк до общей скидки, без доставки.
              </p>
            </div>
          </div>
          <ol>
            {report.data.popularProducts.map((product) => (
              <li key={product.productId}>
                <span>{product.productName}</span>
                <strong>{product.quantity} шт.</strong>
                <small>{money(product.revenue)}</small>
              </li>
            ))}
          </ol>
          {!report.data.popularProducts.length && (
            <p className="async-state">За период нет продаж.</p>
          )}
        </section>
      )}

      {isSuperAdmin && settings.data && (
        <form
          className="editor-card accounting-settings"
          data-testid="accounting-settings-form"
          onSubmit={settingsForm.handleSubmit(updateSettings)}
        >
          <div className="editor-title">
            <div>
              <h2>Настройка смен</h2>
              <p>
                Время применяется к новым отчётным периодам, часовой пояс
                Asia/Ashgabat.
              </p>
            </div>
          </div>
          <div className="form-grid">
            <label>
              Первая смена
              <input {...settingsForm.register("firstShiftName")} />
              <FormFieldError
                message={settingsForm.formState.errors.firstShiftName?.message}
              />
            </label>
            <label>
              Начало
              <input
                type="time"
                {...settingsForm.register("firstShiftStart")}
              />
              <FormFieldError
                message={settingsForm.formState.errors.firstShiftStart?.message}
              />
            </label>
            <label>
              Вторая смена
              <input {...settingsForm.register("secondShiftName")} />
              <FormFieldError
                message={settingsForm.formState.errors.secondShiftName?.message}
              />
            </label>
            <label>
              Начало
              <input
                type="time"
                {...settingsForm.register("secondShiftStart")}
              />
              <FormFieldError
                message={
                  settingsForm.formState.errors.secondShiftStart?.message
                }
              />
            </label>
          </div>
          {actions.updateSettings.error && (
            <div className="inline-alert" role="alert">
              {actions.updateSettings.error instanceof Error
                ? actions.updateSettings.error.message
                : "Не удалось сохранить смены."}
            </div>
          )}
          {actions.updateSettings.isSuccess && (
            <div className="inline-success" role="status">
              Настройки смен сохранены.
            </div>
          )}
          <button
            className="primary-button"
            disabled={
              actions.updateSettings.isPending ||
              !settingsForm.formState.isDirty
            }
            type="submit"
          >
            Сохранить смены
          </button>
        </form>
      )}
    </section>
  );
}
