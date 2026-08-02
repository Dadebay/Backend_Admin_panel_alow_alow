import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import type { CSSProperties, ReactNode } from "react";

function responsiveLabel<TData>(column: ColumnDef<TData, unknown>) {
  if (typeof column.header === "string" && column.header.trim()) {
    return column.header;
  }

  return column.id === "actions" ? "Действия" : "Поле";
}

export function DataTable<TData>({
  columns,
  data,
  empty = "Нет данных",
  getRowId,
  label,
  minWidth = 760,
  variant = "default",
}: {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  empty?: string;
  getRowId?: (row: TData) => string;
  label?: string;
  minWidth?: number;
  variant?: "default" | "orders";
}) {
  // TanStack Table intentionally exposes a mutable table instance.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    columns,
    data,
    getCoreRowModel: getCoreRowModel(),
    getRowId,
  });

  const tableStyle = {
    "--data-table-min-width": `${minWidth}px`,
  } as CSSProperties;

  return (
    <div className="data-table-scroll">
      <table
        aria-label={label}
        className={`data-table data-table--${variant}`}
        style={tableStyle}
      >
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th key={header.id} scope="col">
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.length ? (
            table.getRowModel().rows.map((row) => (
              <tr key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <td
                    data-label={responsiveLabel(cell.column.columnDef)}
                    key={cell.id}
                  >
                    {flexRender(
                      cell.column.columnDef.cell,
                      cell.getContext(),
                    )}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td className="table-empty" colSpan={columns.length}>
                {empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function AsyncPanel({
  pending,
  error,
  onRetry,
  children,
}: {
  pending: boolean;
  error: Error | null;
  onRetry: () => void;
  children: ReactNode;
}) {
  if (pending) return <div className="async-state">Загружаем данные…</div>;
  if (error) {
    return (
      <div className="async-state error">
        <strong>Backend не ответил</strong>
        <p>{error.message}</p>
        <button className="secondary-button" onClick={onRetry}>
          Повторить
        </button>
      </div>
    );
  }
  return children;
}
