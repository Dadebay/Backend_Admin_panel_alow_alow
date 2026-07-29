"use client";

import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import type { ReactNode } from "react";

export function DataTable<TData>({
  columns,
  data,
  empty = "Нет данных",
  getRowId,
}: {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  empty?: string;
  getRowId?: (row: TData) => string;
}) {
  // TanStack Table intentionally exposes a mutable table instance.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    columns,
    data,
    getCoreRowModel: getCoreRowModel(),
    getRowId,
  });

  return (
    <div className="data-table-scroll">
      <table className="data-table">
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
                  <td key={cell.id}>
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
