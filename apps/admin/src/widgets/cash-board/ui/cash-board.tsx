import { useState } from "react";
import { statusLabels, type OrderStatus } from "@/src/entities/order";
import { OrderBoard } from "@/src/widgets/order-board";

const cashStatuses: OrderStatus[] = [
  "CASH_RETURNED",
  "COMPLETED",
  "RECONCILED",
];

export function CashBoard() {
  const [status, setStatus] = useState<OrderStatus>("CASH_RETURNED");
  return (
    <div>
      <div className="view-tabs cash-tabs" role="tablist">
        {cashStatuses.map((value) => (
          <button
            role="tab"
            aria-selected={status === value}
            className={status === value ? "active" : ""}
            key={value}
            onClick={() => setStatus(value)}
          >
            {statusLabels[value]}
          </button>
        ))}
      </div>
      <OrderBoard
        key={status}
        fixedStatus={status}
        title="Контроль наличных"
        description="Курьер сдаёт деньги оператору, затем бухгалтер сверяет закрытый заказ."
      />
    </div>
  );
}
