import { useMemo, type Ref } from "react";
import { useSearchParams } from "react-router";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import {
  useAccountingSales,
  type AccountingSale,
  type AccountingShift,
} from "@/src/entities/accounting";
import { statusLabels } from "@/src/entities/order";
import { AsyncPanel } from "@/src/shared/ui";
import { inspectionMoney, inspectionTime } from "../model/inspection";
import { InspectionPagination } from "./inspection-audit";

const columns: ColumnDef<AccountingSale>[] = [
  {
    accessorKey: "number",
    header: "Заказ",
    cell: ({ row }) => `№${row.original.number}`,
  },
  {
    accessorKey: "createdAt",
    header: "Создан",
    cell: ({ row }) => inspectionTime(row.original.createdAt),
  },
  {
    accessorKey: "cashReturnedAt",
    header: "Деньги возвращены",
    cell: ({ row }) =>
      row.original.cashReturnedAt
        ? inspectionTime(row.original.cashReturnedAt)
        : "Ещё не возвращены",
  },
  {
    accessorKey: "status",
    header: "Статус",
    cell: ({ row }) => statusLabels[row.original.status],
  },
  {
    accessorKey: "foodAmount",
    header: "Еда после скидок",
    cell: ({ row }) => inspectionMoney(row.original.foodAmount),
  },
  {
    accessorKey: "deliveryFee",
    header: "Доставка",
    cell: ({ row }) => inspectionMoney(row.original.deliveryFee),
  },
  {
    accessorKey: "total",
    header: "Всего",
    cell: ({ row }) => inspectionMoney(row.original.total),
  },
];
const rowId = (order: AccountingSale) => order.id;

export function AccountingSales({
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
  const shiftKey = params.get("salesShift") ?? "";
  const basis =
    params.get("salesBasis") === "created" ? "created" : "cashReturned";
  const page = Math.max(
    1,
    Math.min(100000, Number(params.get("salesPage")) || 1),
  );
  const search = new URLSearchParams(
    shiftKey ? { shiftKey } : { fromDate, toDate },
  );
  search.set("basis", basis);
  search.set("page", String(page));
  search.set("limit", "25");
  const sales = useAccountingSales(search.toString());
  const data = useMemo(() => sales.data?.items ?? [], [sales.data]);
  function update(key: string, value: string) {
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      if (value) next.set(key, value);
      else next.delete(key);
      if (key !== "salesPage") next.delete("salesPage");
      return next;
    });
  }
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    columns,
    data,
    getRowId: rowId,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualFiltering: true,
    manualSorting: true,
    rowCount: sales.data?.total ?? 0,
    state: { pagination: { pageIndex: page - 1, pageSize: 25 } },
  });
  return (
    <section
      ref={ref}
      style={{ scrollMarginTop: "4rem" }}
      className="editor-card accounting-inspection"
      data-testid="accounting-sales"
    >
      <header className="editor-title">
        <div>
          <h2>Продажи за день</h2>
          <p>
            Еда после скидок и доставка показаны отдельно. Отменённые заказы
            исключены.
          </p>
        </div>
        <button
          className="secondary-button"
          type="button"
          data-testid="accounting-sales-refresh"
          onClick={() => void sales.refetch()}
        >
          Обновить
        </button>
      </header>
      <div className="inspection-filters">
        <label>
          День кассы
          <select
            data-testid="accounting-sales-shift"
            value={shiftKey}
            onChange={(event) => update("salesShift", event.target.value)}
          >
            <option value="">Весь выбранный период</option>
            {[...shifts].reverse().map((shift) => (
              <option key={shift.shiftKey} value={shift.shiftKey}>
                {shift.shiftName} · {inspectionTime(shift.periodStart)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Как считать
          <select
            data-testid="accounting-sales-basis"
            value={basis}
            onChange={(event) => update("salesBasis", event.target.value)}
          >
            <option value="cashReturned">По возврату денег</option>
            <option value="created">По созданию заказов</option>
          </select>
        </label>
      </div>
      <p data-testid="accounting-sales-explanation">
        {basis === "cashReturned"
          ? "В выбранный день вернули деньги по этим заказам. Заказ мог быть создан раньше. Для старой сданной смены показаны заказы её пакета."
          : "Эти заказы созданы в выбранное время. Суммы по заказам не означают, что деньги уже возвращены."}
      </p>
      <AsyncPanel
        pending={sales.isPending}
        error={sales.error}
        onRetry={() => void sales.refetch()}
      >
        {sales.data && (
          <>
            <div
              className="accounting-metrics"
              data-testid="accounting-sales-summary"
            >
              <article>
                <span>Заказов</span>
                <strong>{sales.data.total}</strong>
              </article>
              <article>
                <span>Еда после скидок</span>
                <strong>
                  {inspectionMoney(sales.data.summary.foodAmount)}
                </strong>
              </article>
              <article>
                <span>Доставка отдельно</span>
                <strong>
                  {inspectionMoney(sales.data.summary.deliveryAmount)}
                </strong>
              </article>
              <article>
                <span>Всего с доставкой</span>
                <strong>
                  {inspectionMoney(sales.data.summary.totalAmount)}
                </strong>
              </article>
            </div>
            <div
              className="data-table-scroll"
              data-testid="accounting-sales-table"
            >
              <table className="data-table" aria-label="Продажи кассовой смены">
                <thead>
                  {table.getHeaderGroups().map((group) => (
                    <tr key={group.id}>
                      {group.headers.map((header) => (
                        <th key={header.id} scope="col">
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {table.getRowModel().rows.map((row) => (
                    <tr key={row.id}>
                      {row.getVisibleCells().map((cell) => (
                        <td
                          key={cell.id}
                          data-label={String(cell.column.columnDef.header)}
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!data.length && (
              <p className="async-state" data-testid="accounting-sales-empty">
                Продаж за выбранное время нет.
              </p>
            )}
            <InspectionPagination
              {...sales.data}
              prefix="accounting-sales"
              onPage={(next) => update("salesPage", String(next))}
            />
          </>
        )}
      </AsyncPanel>
    </section>
  );
}
