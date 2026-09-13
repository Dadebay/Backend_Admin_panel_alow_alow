import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { useBranches } from "@/src/entities/branch";
import {
  formatInventoryQuantity,
  inventoryStatusLabels,
  inventorySummary,
  thresholdCoverage,
  useInventoryStock,
  type StockItem,
} from "@/src/entities/inventory";
import { StockAdjustment } from "./stock-adjustment";
import "./inventory-dashboard.css";

const statusOrder: StockItem["status"][] = [
  "OUT_OF_STOCK",
  "LOW_STOCK",
  "IN_STOCK",
];

export function InventoryDashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const branchId = searchParams.get("branchId") || undefined;
  const selectedStatus = searchParams.get("stockStatus") ?? "all";
  const stock = useInventoryStock(branchId);
  const branches = useBranches();
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const counts = inventorySummary(stock.data ?? []);
  const total = stock.data?.length ?? 0;
  const visible = useMemo(
    () =>
      (stock.data ?? [])
        .filter(
          (item) => selectedStatus === "all" || item.status === selectedStatus,
        )
        .sort(
          (a, b) =>
            statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status) ||
            a.ingredientName.localeCompare(b.ingredientName, "ru"),
        ),
    [stock.data, selectedStatus],
  );
  function filter(name: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (!value || value === "all") next.delete(name);
    else next.set(name, value);
    setSearchParams(next, { replace: true });
    setEditingKey(null);
    setSaved(false);
  }
  return (
    <article
      className="table-card inventory-dashboard"
      data-testid="inventory-dashboard"
      id="inventory-stock"
    >
      <div className="card-title">
        <div>
          <span className="eyebrow">Запасы кухни</span>
          <h2>Склад и наличие</h2>
          <p>
            Заказ резервирует ингредиенты по рецептуре. Отмена до фактической
            передачи курьеру автоматически возвращает резерв на склад.
          </p>
        </div>
        <label className="compact-field">
          <span>Филиал</span>
          <select
            data-testid="inventory-branch-filter"
            value={branchId ?? ""}
            onChange={(event) => filter("branchId", event.target.value)}
          >
            <option value="">Все филиалы</option>
            {branches.data?.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="inventory-content">
        {branches.isError && (
          <p className="error-text" role="alert">
            Не удалось загрузить филиалы.{" "}
            <button
              type="button"
              className="text-button"
              data-testid="inventory-branches-retry"
              onClick={() => void branches.refetch()}
            >
              Повторить
            </button>
          </p>
        )}
        {stock.isPending ? (
          <div className="inventory-loading" role="status">
            <p>Загружаем остатки…</p>
          </div>
        ) : stock.isError ? (
          <div className="alert-panel" role="alert">
            <strong>Не удалось обновить остатки</strong>
            <p>{stock.error.message}</p>
            <button
              type="button"
              className="secondary-button"
              data-testid="inventory-retry"
              onClick={() => void stock.refetch()}
            >
              Повторить
            </button>
          </div>
        ) : total === 0 ? (
          <p className="async-state">
            Пока нет остатков для отображения. Добавьте ингредиенты и активный
            филиал, затем оформите приход.
          </p>
        ) : (
          <>
            <div
              className="inventory-summary"
              data-testid="inventory-summary"
              aria-label="Наличие по складским позициям"
            >
              {(["IN_STOCK", "LOW_STOCK", "OUT_OF_STOCK"] as const).map(
                (status) => (
                  <button
                    type="button"
                    data-testid={`inventory-summary-${status}`}
                    className={`inventory-stat inventory-tone-${status}`}
                    key={status}
                    aria-pressed={selectedStatus === status}
                    onClick={() =>
                      filter(
                        "stockStatus",
                        selectedStatus === status ? "all" : status,
                      )
                    }
                  >
                    <span>{inventoryStatusLabels[status]}</span>
                    <strong>{counts[status]}</strong>
                    <small>позиций по филиалам</small>
                  </button>
                ),
              )}
            </div>
            <figure
              className="inventory-chart"
              data-testid="inventory-availability-chart"
            >
              <figcaption>Наличие · {total} складских позиций</figcaption>
              <div
                className="inventory-stacked-bar"
                role="img"
                aria-label={`В наличии: ${counts.IN_STOCK}; заканчивается: ${counts.LOW_STOCK}; нет: ${counts.OUT_OF_STOCK}`}
              >
                {(["IN_STOCK", "LOW_STOCK", "OUT_OF_STOCK"] as const).map(
                  (status) =>
                    counts[status] > 0 && (
                      <span
                        key={status}
                        className={`inventory-tone-${status}`}
                        style={{ width: `${(counts[status] / total) * 100}%` }}
                      />
                    ),
                )}
              </div>
              <p className="muted-text">
                Диаграмма считает позиции, а остатки ниже показаны в своих
                единицах: граммах, миллилитрах и штуках.
              </p>
            </figure>
            {counts.LOW_STOCK + counts.OUT_OF_STOCK > 0 && (
              <div
                className="alert-panel"
                data-testid="inventory-low-stock-notice"
              >
                <strong>Пора пополнить запасы</strong>
                <span>
                  Заканчивается: {counts.LOW_STOCK}. Нет в наличии:{" "}
                  {counts.OUT_OF_STOCK}. Позиции с недостатком показаны первыми.
                </span>
              </div>
            )}
            {saved && (
              <p
                className="success-text"
                role="status"
                data-testid="inventory-save-success"
              >
                Операция сохранена. Остатки обновлены.
              </p>
            )}
            <div className="inventory-list-heading">
              <h3>Остатки по ингредиентам</h3>
              <label>
                <span className="sr-only">Состояние остатка</span>
                <select
                  data-testid="inventory-status-filter"
                  value={selectedStatus}
                  onChange={(event) =>
                    filter("stockStatus", event.target.value)
                  }
                >
                  <option value="all">Все состояния</option>
                  {statusOrder.map((status) => (
                    <option key={status} value={status}>
                      {inventoryStatusLabels[status]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {!visible.length && (
              <p className="muted-text">Нет позиций с выбранным состоянием.</p>
            )}
            <ul
              className="inventory-stock-list"
              data-testid="inventory-stock-list"
            >
              {visible.map((item) => {
                const key = `${item.branchId}:${item.ingredientId}`;
                const coverage = thresholdCoverage(item);
                return (
                  <li key={key} data-testid={`inventory-stock-${key}`}>
                    <div className="inventory-stock-row">
                      <div>
                        <strong>{item.ingredientName}</strong>
                        <small>{item.branchName}</small>
                      </div>
                      <div className="inventory-stock-value">
                        <strong>
                          {formatInventoryQuantity(item.quantity, item.unit)}
                        </strong>
                        <span
                          className={`inventory-status inventory-tone-${item.status}`}
                        >
                          {inventoryStatusLabels[item.status]}
                        </span>
                      </div>
                      <div className="inventory-stock-meter">
                        <small>
                          {coverage === null
                            ? "Порог пополнения не задан"
                            : `Порог: ${formatInventoryQuantity(item.reorderPoint, item.unit)}`}
                        </small>
                        {coverage !== null && (
                          <div
                            className="inventory-meter"
                            role="meter"
                            aria-label={`Запас относительно порога: ${item.ingredientName}, ${item.branchName}`}
                            aria-valuenow={coverage}
                            aria-valuemin={0}
                            aria-valuemax={100}
                          >
                            <span style={{ width: `${coverage}%` }} />
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        data-testid={`inventory-adjust-${key}`}
                        className="secondary-button"
                        aria-expanded={editingKey === key}
                        onClick={() => {
                          setEditingKey(editingKey === key ? null : key);
                          setSaved(false);
                        }}
                      >
                        Приход / расход
                      </button>
                    </div>
                    {editingKey === key && (
                      <StockAdjustment
                        key={key}
                        item={item}
                        onClose={() => setEditingKey(null)}
                        onSaved={() => {
                          setEditingKey(null);
                          setSaved(true);
                        }}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="muted-text">
              Обновление каждые 15 секунд, пока страница видима. Уведомления об
              уменьшении — в кнопке «Склад» сверху.
            </p>
          </>
        )}
      </div>
    </article>
  );
}
