import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import {
  type AccountingShift,
  useAccountingReport,
  useAccountingSettings,
  useAccountingShifts,
} from "@/src/entities/accounting";
import { useAccountingActions } from "@/src/features/accounting-management";
import { FormFieldError } from "@/src/shared/forms";
import { useSession } from "@/src/shared/auth";
import { AsyncPanel } from "@/src/shared/ui";
import {
  accountingRangeSchema,
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
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value) + " TMT";
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

function actorName(actor: AccountingShift["handoff"] extends infer H
  ? H extends { submittedBy: infer A }
    ? A
    : never
  : never) {
  if (!actor || typeof actor !== "object") return "—";
  const value = [actor.firstName, actor.lastName].filter(Boolean).join(" ");
  return value || "Сотрудник";
}

export function AccountingDashboard() {
  const { session } = useSession();
  const role = session?.user.role;
  const isAdmin = role === "ADMIN" || role === "SUPER_ADMIN";
  const canSeeReport = role === "ACCOUNTANT" || role === "SUPER_ADMIN";
  const isSuperAdmin = role === "SUPER_ADMIN";
  const today = ashgabatDate();
  const [range, setRange] = useState<AccountingRangeValues>({
    fromDate: offsetDate(today, -6),
    toDate: today,
  });
  const [selectedShift, setSelectedShift] = useState<AccountingShift | null>(null);
  const settings = useAccountingSettings();
  const shifts = useAccountingShifts(range.fromDate, range.toDate);
  const report = useAccountingReport(range.fromDate, range.toDate);
  const actions = useAccountingActions();
  const rangeForm = useForm<AccountingRangeValues>({
    resolver: zodResolver(accountingRangeSchema),
    defaultValues: range,
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
          <h1>Деньги по сменам</h1>
          <p>
            Администратор сдаёт пакет за смену, бухгалтер подтверждает сумму.
          </p>
        </div>
      </header>

      <form
        className="accounting-range editor-card"
        data-testid="accounting-range-form"
        onSubmit={rangeForm.handleSubmit(setRange)}
      >
        <div className="accounting-presets" aria-label="Быстрый период">
          <button type="button" onClick={() => applyPreset(1)}>Сегодня</button>
          <button type="button" onClick={() => applyPreset(7)}>7 дней</button>
          <button type="button" onClick={() => applyPreset(30)}>30 дней</button>
        </div>
        <label>
          С даты
          <input type="date" {...rangeForm.register("fromDate")} />
          <FormFieldError message={rangeForm.formState.errors.fromDate?.message} />
        </label>
        <label>
          По дату
          <input type="date" {...rangeForm.register("toDate")} />
          <FormFieldError message={rangeForm.formState.errors.toDate?.message} />
        </label>
        <button className="secondary-button" type="submit">Показать</button>
      </form>

      {canSeeReport && (
        <AsyncPanel
          pending={report.isPending}
          error={report.error}
          onRetry={() => void report.refetch()}
        >
          {report.data && (
            <>
              <div className="accounting-metrics" data-testid="accounting-summary">
                <article><span>Получено наличными</span><strong>{money(report.data.summary.collectedAmount)}</strong><small>{report.data.summary.completedOrders} заказов</small></article>
                <article><span>Передано бухгалтеру</span><strong>{money(report.data.summary.submittedAmount)}</strong><small>в пакетах смен</small></article>
                <article><span>Подтверждено</span><strong>{money(report.data.summary.confirmedAmount)}</strong><small>сверено бухгалтером</small></article>
                <article className={report.data.summary.outstandingAmount ? "needs-action" : ""}><span>Осталось сдать</span><strong>{money(report.data.summary.outstandingAmount)}</strong><small>завершённые заказы</small></article>
                <article><span>Средний чек</span><strong>{money(report.data.summary.averageOrderAmount)}</strong><small>без отмен</small></article>
                <article><span>Отказы</span><strong>{report.data.summary.cancelledOrders}</strong><small>{report.data.summary.cancellationRate}% от завершённых и отменённых</small></article>
              </div>

              <section className="editor-card accounting-chart" data-testid="accounting-daily-report">
                <div className="editor-title"><div><h2>Выручка по дням</h2><p>Часовой пояс Asia/Ashgabat</p></div></div>
                <div className="accounting-bars">
                  {report.data.daily.map((day) => (
                    <div className="accounting-bar-row" key={day.date}>
                      <time dateTime={day.date}>{day.date.slice(5).split("-").reverse().join(".")}</time>
                      <div><span style={{ width: `${Math.max(2, (day.amount / maxDaily) * 100)}%` }} /></div>
                      <strong>{money(day.amount)}</strong>
                      <small>{day.orderCount} зак.</small>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}
        </AsyncPanel>
      )}

      <AsyncPanel
        pending={shifts.isPending}
        error={shifts.error}
        onRetry={() => void shifts.refetch()}
      >
        <section className="editor-card accounting-shifts" data-testid="accounting-shifts">
          <div className="editor-title">
            <div>
              <h2>{isAdmin ? "Суммы к сдаче" : "Пакеты на подтверждение"}</h2>
              <p>Границы смен берутся из настроек и не меняют уже созданные пакеты.</p>
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
                  <div><strong>{shift.shiftName}</strong><small>{periodLabel(shift.periodStart, shift.periodEnd)}</small></div>
                  <span>{stateLabels[shift.state]}</span>
                </div>
                <dl>
                  <div><dt>По системе</dt><dd>{money(shift.expectedAmount)}</dd></div>
                  <div><dt>Заказов</dt><dd>{shift.settlementCount}</dd></div>
                </dl>
                {shift.handoff && (
                  <div className="accounting-handoff-detail">
                    <span>Заявлено: <strong>{money(shift.handoff.declaredAmount)}</strong></span>
                    <span>Сдал: {actorName(shift.handoff.submittedBy)}</span>
                    {shift.handoff.declaredAmount !== shift.handoff.expectedAmount && (
                      <b>Разница: {money(shift.handoff.declaredAmount - shift.handoff.expectedAmount)}</b>
                    )}
                  </div>
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
                    {actions.confirmHandoff.isPending ? "Подтверждаем…" : "Подтвердить деньги"}
                  </button>
                )}
              </article>
            ))}
          </div>
          {!shifts.data?.length && <p className="async-state">За выбранный период смен нет.</p>}
        </section>
      </AsyncPanel>

      {selectedShift && (
        <form
          className="editor-card accounting-handoff-form"
          data-testid="accounting-handoff-form"
          onSubmit={handoffForm.handleSubmit(submitHandoff)}
        >
          <div className="editor-title">
            <div><h2>Сдать «{selectedShift.shiftName}»</h2><p>{periodLabel(selectedShift.periodStart, selectedShift.periodEnd)}</p></div>
            <button className="secondary-button" type="button" onClick={() => setSelectedShift(null)}>Закрыть</button>
          </div>
          <div className="form-grid">
            <label>
              Фактически передаёте, TMT
              <input type="number" step="0.01" {...handoffForm.register("declaredAmount", { valueAsNumber: true })} />
              <FormFieldError message={handoffForm.formState.errors.declaredAmount?.message} />
            </label>
            <label className="wide-field">
              Комментарий при расхождении
              <textarea rows={3} {...handoffForm.register("note")} />
              <FormFieldError message={handoffForm.formState.errors.note?.message} />
            </label>
          </div>
          {actions.submitHandoff.error && <div className="inline-alert" role="alert">{actions.submitHandoff.error instanceof Error ? actions.submitHandoff.error.message : "Не удалось сдать смену."}</div>}
          <button className="primary-button" disabled={actions.submitHandoff.isPending} type="submit">
            {actions.submitHandoff.isPending ? "Передаём…" : "Передать бухгалтеру"}
          </button>
        </form>
      )}

      {actions.confirmHandoff.error && (
        <div className="inline-alert" role="alert">
          {actions.confirmHandoff.error instanceof Error ? actions.confirmHandoff.error.message : "Не удалось подтвердить пакет."}
        </div>
      )}

      {isSuperAdmin && report.data && (
        <section className="editor-card accounting-products" data-testid="accounting-products">
          <div className="editor-title"><div><h2>Ходовые блюда</h2><p>По оплаченным заказам выбранного периода</p></div></div>
          <ol>
            {report.data.popularProducts.map((product) => (
              <li key={product.productId}><span>{product.productName}</span><strong>{product.quantity} шт.</strong><small>{money(product.revenue)}</small></li>
            ))}
          </ol>
          {!report.data.popularProducts.length && <p className="async-state">За период нет продаж.</p>}
        </section>
      )}

      {isSuperAdmin && settings.data && (
        <form
          className="editor-card accounting-settings"
          data-testid="accounting-settings-form"
          onSubmit={settingsForm.handleSubmit(updateSettings)}
        >
          <div className="editor-title"><div><h2>Настройка смен</h2><p>Время применяется к новым отчётным периодам, часовой пояс Asia/Ashgabat.</p></div></div>
          <div className="form-grid">
            <label>Первая смена<input {...settingsForm.register("firstShiftName")} /><FormFieldError message={settingsForm.formState.errors.firstShiftName?.message} /></label>
            <label>Начало<input type="time" {...settingsForm.register("firstShiftStart")} /><FormFieldError message={settingsForm.formState.errors.firstShiftStart?.message} /></label>
            <label>Вторая смена<input {...settingsForm.register("secondShiftName")} /><FormFieldError message={settingsForm.formState.errors.secondShiftName?.message} /></label>
            <label>Начало<input type="time" {...settingsForm.register("secondShiftStart")} /><FormFieldError message={settingsForm.formState.errors.secondShiftStart?.message} /></label>
          </div>
          {actions.updateSettings.error && <div className="inline-alert" role="alert">{actions.updateSettings.error instanceof Error ? actions.updateSettings.error.message : "Не удалось сохранить смены."}</div>}
          {actions.updateSettings.isSuccess && <div className="inline-success" role="status">Настройки смен сохранены.</div>}
          <button className="primary-button" disabled={actions.updateSettings.isPending || !settingsForm.formState.isDirty} type="submit">Сохранить смены</button>
        </form>
      )}
    </section>
  );
}
