import { useState } from "react";
import { orderItemLabel, type Order, type Role } from "@/src/entities/order";

type OrderPackingChecklistProps = {
  order: Order;
  role: Role;
  pending: boolean;
  onConfirm: (order: Order, checkedItemIds: string[]) => void;
};

function formatPackedAt(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function OrderPackingChecklist({
  order,
  role,
  pending,
  onConfirm,
}: OrderPackingChecklistProps) {
  const [checkedItemIds, setCheckedItemIds] = useState<Set<string>>(
    () => new Set(),
  );

  if (order.status !== "READY") return null;

  if (order.packingConfirmedAt) {
    return (
      <div
        className="order-packing-confirmed"
        data-testid={`order-packing-confirmed-${order.id}`}
      >
        <span aria-hidden="true">✓</span>
        <strong>Заказ собран</strong>
        <small>{formatPackedAt(order.packingConfirmedAt)}</small>
      </div>
    );
  }

  if (!["ADMIN", "SUPER_ADMIN"].includes(role)) {
    return (
      <p className="order-packing-waiting">
        Ожидает проверки и сборки администратором
      </p>
    );
  }

  const allChecked = checkedItemIds.size === order.items.length;

  return (
    <fieldset
      className="order-packing-checklist"
      data-testid={`order-packing-checklist-${order.id}`}
    >
      <legend>Проверка сборки</legend>
      {order.items.map((item) => (
        <label key={item.id}>
          <input
            type="checkbox"
            data-testid={`order-packing-item-${order.id}-${item.id}`}
            checked={checkedItemIds.has(item.id)}
            onChange={(event) => {
              setCheckedItemIds((current) => {
                const next = new Set(current);
                if (event.target.checked) next.add(item.id);
                else next.delete(item.id);
                return next;
              });
            }}
          />
          <span>
            <b>{item.quantity}×</b> {orderItemLabel(item)}
          </span>
        </label>
      ))}
      <button
        type="button"
        className="primary-button compact"
        data-testid={`order-confirm-packing-${order.id}`}
        disabled={!allChecked || pending}
        onClick={() => onConfirm(order, [...checkedItemIds])}
      >
        ✓ Заказ собран
      </button>
    </fieldset>
  );
}
