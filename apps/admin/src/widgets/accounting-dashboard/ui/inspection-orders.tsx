import { useMemo } from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import type {
  InspectionOrder,
  InspectionOrdersPage,
} from "@/src/entities/accounting";
import { statusLabels } from "@/src/entities/order";
import { inspectionMoney, inspectionTime } from "../model/inspection";
import { InspectionPagination } from "./inspection-audit";

const rowId = (order: InspectionOrder) => order.id;
export function InspectionOrders({
  data,
  onOrder,
  onPage,
}: {
  data: InspectionOrdersPage;
  onOrder: (id: string) => void;
  onPage: (page: number) => void;
}) {
  const columns = useMemo<ColumnDef<InspectionOrder>[]>(
    () => [
      {
        id: "number",
        header: "Заказ",
        cell: ({ row }) => (
          <button
            className="secondary-button"
            type="button"
            data-testid={`inspection-open-order-${row.original.id}`}
            onClick={() => onOrder(row.original.id)}
          >
            №{row.original.number}
          </button>
        ),
      },
      {
        id: "createdAt",
        header: "Создан",
        cell: ({ row }) => inspectionTime(row.original.createdAt),
      },
      {
        id: "status",
        header: "Статус / отмена",
        cell: ({ row }) => (
          <>
            <strong>{statusLabels[row.original.status]}</strong>
            {row.original.cancellationReason && (
              <p>{row.original.cancellationReason}</p>
            )}
          </>
        ),
      },
      {
        id: "foodAmount",
        header: "Еда после скидок",
        cell: ({ row }) => inspectionMoney(row.original.foodAmount),
      },
      {
        id: "delivery",
        header: "Доставка отдельно",
        cell: ({ row }) => inspectionMoney(row.original.deliveryFee),
      },
      {
        id: "location",
        header: "Локация",
        cell: ({ row }) => (
          <>
            {row.original.deliveryEtrapName ?? "Район не определён"}
            <small>{row.original.branchName ?? "Без филиала"}</small>
            <small>{row.original.address}</small>
          </>
        ),
      },
      {
        id: "courier",
        header: "Курьер",
        cell: ({ row }) =>
          row.original.courier
            ? [row.original.courier.firstName, row.original.courier.lastName]
                .filter(Boolean)
                .join(" ") || row.original.courier.id
            : "Не назначен",
      },
    ],
    [onOrder],
  );
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    columns,
    data: data.items,
    getRowId: rowId,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualFiltering: true,
    manualSorting: true,
    rowCount: data.total,
    state: { pagination: { pageIndex: data.page - 1, pageSize: data.limit } },
  });
  return (
    <div data-testid="inspection-orders">
      <div className="data-table-scroll">
        <table className="data-table" aria-label="Заказы смены">
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
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!data.items.length && <p className="async-state">Заказы не найдены.</p>}
      <InspectionPagination
        {...data}
        onPage={onPage}
        prefix="inspection-orders"
      />
    </div>
  );
}
