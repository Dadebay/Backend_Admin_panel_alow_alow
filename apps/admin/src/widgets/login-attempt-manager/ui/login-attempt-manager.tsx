import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import {
  useLoginAttempts,
  type LoginAttempt,
  type LoginAttemptFilters,
  type LoginAttemptPlatform,
  type LoginAttemptStatus,
} from "@/src/entities/login-attempt";
import { AsyncPanel, DataTable } from "@/src/shared/ui";

const statuses: LoginAttemptStatus[] = [
  "REQUESTED",
  "VERIFIED",
  "FAILED",
  "EXPIRED",
];

const statusLabels: Record<LoginAttemptStatus, string> = {
  REQUESTED: "Запрошен",
  VERIFIED: "Подтверждён",
  FAILED: "Неверный код",
  EXPIRED: "Истёк",
};

const platforms: LoginAttemptPlatform[] = ["ANDROID", "IOS"];

function localDate(value: string) {
  return new Date(value).toLocaleString("ru-RU");
}

function localDateTimeInput(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  const localTime = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localTime.toISOString().slice(0, 16);
}

export function LoginAttemptManager() {
  const [filters, setFilters] = useState<LoginAttemptFilters>({
    page: 1,
    limit: 25,
  });
  const attempts = useLoginAttempts(filters);
  const data = attempts.data;
  const columns = useMemo<ColumnDef<LoginAttempt, unknown>[]>(
    () => [
      {
        header: "Дата и время",
        cell: ({ row }) => localDate(row.original.createdAt),
      },
      {
        header: "Телефон",
        cell: ({ row }) => (
          <a href={`tel:${row.original.phone}`}>{row.original.phone}</a>
        ),
      },
      {
        header: "Пользователь",
        cell: ({ row }) =>
          row.original.user
            ? [row.original.user.firstName, row.original.user.lastName]
                .filter(Boolean)
                .join(" ") || "Без имени"
            : "—",
      },
      {
        header: "Статус",
        cell: ({ row }) => (
          <span
            className={`login-attempt-status ${row.original.status.toLowerCase()}`}
          >
            {statusLabels[row.original.status]}
          </span>
        ),
      },
      {
        header: "Устройство",
        cell: ({ row }) => row.original.deviceName ?? "—",
      },
      {
        header: "Installation ID",
        cell: ({ row }) =>
          row.original.installationId ? (
            <button
              className="text-button mono"
              title={row.original.installationId}
              onClick={() =>
                void navigator.clipboard?.writeText(
                  row.original.installationId!,
                )
              }
            >
              {row.original.installationId.slice(0, 12)}…
            </button>
          ) : (
            "—"
          ),
      },
      {
        header: "Платформа",
        cell: ({ row }) => row.original.platform ?? "—",
      },
    ],
    [],
  );

  function update(next: Partial<LoginAttemptFilters>) {
    setFilters((current) => ({
      ...current,
      ...next,
      page: next.page ?? 1,
    }));
  }

  function resetFilters() {
    setFilters({ page: 1, limit: filters.limit });
  }

  const summary = data?.summary;
  const hasActiveFilters = Boolean(
    filters.phone ||
      filters.status ||
      filters.platform ||
      filters.from ||
      filters.to,
  );

  return (
    <section
      className="admin-section login-attempt-manager"
      data-testid="login-attempt-manager"
    >
      <header className="section-head" data-testid="login-attempt-header">
        <div>
          <span className="eyebrow">БЕЗОПАСНОСТЬ</span>
          <h1>Попытки входа</h1>
          <p>Коды OTP не сохраняются и не отображаются.</p>
        </div>
      </header>

      <div
        className="login-attempt-summary"
        data-testid="login-attempt-summary"
      >
        <div className="stat-card stat-card--total">
          <span>Всего попыток</span>
          <strong>{summary?.total ?? 0}</strong>
        </div>
        <div className="stat-card stat-card--verified">
          <span>Успешные входы</span>
          <strong>{summary?.verified ?? 0}</strong>
        </div>
        <div className="stat-card stat-card--failed">
          <span>Неуспешные</span>
          <strong>{summary?.failed ?? 0}</strong>
        </div>
        <div className="stat-card stat-card--pending">
          <span>Ожидают / истекли</span>
          <strong>{summary?.requestedOrExpired ?? 0}</strong>
        </div>
      </div>

      <section
        className="toolbar login-attempt-filters"
        data-testid="login-attempt-filters"
        aria-label="Фильтры журнала входов"
      >
        <div className="toolbar-heading">
          <div>
            <span className="eyebrow">ФИЛЬТРЫ</span>
            <strong>Найдите нужную попытку</strong>
          </div>
          <button
            className="secondary-button compact"
            data-testid="login-attempt-reset"
            disabled={!hasActiveFilters}
            type="button"
            onClick={resetFilters}
          >
            Сбросить
          </button>
        </div>
        <div className="login-attempt-filter-grid">
          <label>
            <span>Телефон</span>
            <input
              data-testid="login-attempt-phone"
              value={filters.phone ?? ""}
              onChange={(event) => update({ phone: event.target.value })}
              placeholder="+993…"
            />
          </label>
          <label>
            <span>Статус</span>
            <select
              data-testid="login-attempt-status"
              value={filters.status ?? ""}
              onChange={(event) => {
                const value = event.target.value;
                update({
                  status: value ? (value as LoginAttemptStatus) : undefined,
                });
              }}
            >
              <option value="">Все</option>
              {statuses.map((status) => (
                <option key={status} value={status}>
                  {statusLabels[status]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Платформа</span>
            <select
              data-testid="login-attempt-platform"
              value={filters.platform ?? ""}
              onChange={(event) => {
                const value = event.target.value;
                update({
                  platform: value ? (value as LoginAttemptPlatform) : undefined,
                });
              }}
            >
              <option value="">Все</option>
              {platforms.map((platform) => (
                <option key={platform} value={platform}>
                  {platform}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Начало периода</span>
            <input
              data-testid="login-attempt-from"
              type="datetime-local"
              value={localDateTimeInput(filters.from)}
              onChange={(event) =>
                update({
                  from: event.target.value
                    ? new Date(event.target.value).toISOString()
                    : undefined,
                })
              }
            />
          </label>
          <label>
            <span>Конец периода</span>
            <input
              data-testid="login-attempt-to"
              type="datetime-local"
              value={localDateTimeInput(filters.to)}
              onChange={(event) =>
                update({
                  to: event.target.value
                    ? new Date(event.target.value).toISOString()
                    : undefined,
                })
              }
            />
          </label>
        </div>
      </section>

      <article
        className="table-card login-attempt-table"
        data-testid="login-attempt-table-card"
      >
        <div className="card-title">
          <h2>Журнал входов</h2>
          <span>{data?.total ?? 0}</span>
        </div>
        <AsyncPanel
          pending={attempts.isPending}
          error={attempts.error}
          onRetry={() => void attempts.refetch()}
        >
          <DataTable
            columns={columns}
            data={data?.items ?? []}
            getRowId={(attempt) => attempt.id}
            empty="Попыток входа пока нет"
            label="Попытки входа"
            minWidth={1120}
          />
          <div className="table-pagination">
            <span>Всего: {data?.total ?? 0}</span>
            <div>
              <button
                className="secondary-button compact"
                data-testid="login-attempt-previous-page"
                disabled={filters.page <= 1}
                onClick={() => update({ page: filters.page - 1 })}
              >
                Назад
              </button>
              <span>Страница {filters.page}</span>
              <button
                className="secondary-button compact"
                data-testid="login-attempt-next-page"
                disabled={!data || filters.page * filters.limit >= data.total}
                onClick={() => update({ page: filters.page + 1 })}
              >
                Далее
              </button>
            </div>
          </div>
        </AsyncPanel>
      </article>
    </section>
  );
}
