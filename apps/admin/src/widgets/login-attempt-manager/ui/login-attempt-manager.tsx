import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useLoginAttempts, type LoginAttempt, type LoginAttemptFilters, type LoginAttemptPlatform, type LoginAttemptStatus } from "@/src/entities/login-attempt";
import { AsyncPanel, DataTable } from "@/src/shared/ui";

const statuses: LoginAttemptStatus[] = ["REQUESTED", "VERIFIED", "FAILED", "EXPIRED"];
const statusLabels: Record<LoginAttemptStatus, string> = {
  REQUESTED: "Запрошен", VERIFIED: "Подтверждён", FAILED: "Неверный код", EXPIRED: "Истёк",
};
const platforms: LoginAttemptPlatform[] = ["ANDROID", "IOS"];

function localDate(value: string) {
  return new Date(value).toLocaleString("ru-RU");
}

export function LoginAttemptManager() {
  const [filters, setFilters] = useState<LoginAttemptFilters>({ page: 1, limit: 25 });
  const attempts = useLoginAttempts(filters);
  const data = attempts.data;
  const columns = useMemo<ColumnDef<LoginAttempt, unknown>[]>(() => [
    { header: "Дата и время", cell: ({ row }) => localDate(row.original.createdAt) },
    { header: "Телефон", cell: ({ row }) => <a href={`tel:${row.original.phone}`}>{row.original.phone}</a> },
    { header: "Пользователь", cell: ({ row }) => row.original.user ? [row.original.user.firstName, row.original.user.lastName].filter(Boolean).join(" ") || "Без имени" : "—" },
    { header: "Статус", cell: ({ row }) => <span className={`login-attempt-status ${row.original.status.toLowerCase()}`}>{statusLabels[row.original.status]}</span> },
    { header: "Устройство", cell: ({ row }) => row.original.deviceName ?? "—" },
    { header: "Installation ID", cell: ({ row }) => row.original.installationId ? <button className="text-button mono" title={row.original.installationId} onClick={() => void navigator.clipboard?.writeText(row.original.installationId!)}>{row.original.installationId.slice(0, 12)}…</button> : "—" },
    { header: "Платформа", cell: ({ row }) => row.original.platform ?? "—" },
  ], []);

  function update(next: Partial<LoginAttemptFilters>) {
    setFilters((current) => ({ ...current, ...next, page: next.page ?? 1 }));
  }
  const summary = data?.summary;
  return <section className="admin-section login-attempt-manager">
    <header className="section-head"><div><span className="eyebrow">БЕЗОПАСНОСТЬ</span><h1>Попытки входа</h1><p>Коды OTP не сохраняются и не отображаются.</p></div></header>
    <div className="login-attempt-summary">
      <div className="stat-card"><span>Всего попыток</span><strong>{summary?.total ?? 0}</strong></div>
      <div className="stat-card"><span>Успешные входы</span><strong>{summary?.verified ?? 0}</strong></div>
      <div className="stat-card"><span>Неуспешные</span><strong>{summary?.failed ?? 0}</strong></div>
      <div className="stat-card"><span>Ожидают / истекли</span><strong>{summary?.requestedOrExpired ?? 0}</strong></div>
    </div>
    <div className="toolbar login-attempt-filters">
      <label>Телефон <input value={filters.phone ?? ""} onChange={(event) => update({ phone: event.target.value })} placeholder="+993…" /></label>
      <label>Статус <select value={filters.status ?? ""} onChange={(event) => update({ status: event.target.value as LoginAttemptStatus || undefined })}><option value="">Все</option>{statuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}</select></label>
      <label>Платформа <select value={filters.platform ?? ""} onChange={(event) => update({ platform: event.target.value as LoginAttemptPlatform || undefined })}><option value="">Все</option>{platforms.map((platform) => <option key={platform}>{platform}</option>)}</select></label>
      <label>С <input type="datetime-local" value={filters.from ?? ""} onChange={(event) => update({ from: event.target.value ? new Date(event.target.value).toISOString() : undefined })} /></label>
      <label>По <input type="datetime-local" value={filters.to ?? ""} onChange={(event) => update({ to: event.target.value ? new Date(event.target.value).toISOString() : undefined })} /></label>
    </div>
    <AsyncPanel pending={attempts.isPending} error={attempts.error} onRetry={() => void attempts.refetch()}>
      <DataTable columns={columns} data={data?.items ?? []} getRowId={(attempt) => attempt.id} empty="Попыток входа пока нет" label="Попытки входа" minWidth={1120} />
      <div className="table-pagination"><span>Всего: {data?.total ?? 0}</span><div><button className="secondary-button compact" disabled={filters.page <= 1} onClick={() => update({ page: filters.page - 1 })}>Назад</button><span>Страница {filters.page}</span><button className="secondary-button compact" disabled={!data || filters.page * filters.limit >= data.total} onClick={() => update({ page: filters.page + 1 })}>Далее</button></div></div>
    </AsyncPanel>
  </section>;
}
