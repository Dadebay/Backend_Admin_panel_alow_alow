import type { components } from "@alowalow/api-contract";

export type Order = components["schemas"]["OrderResponseDto"];
export type OrderList = components["schemas"]["OrderListResponseDto"];
export type OrderStatus = Order["status"];
export type Role = components["schemas"]["Role"];
export type Courier = components["schemas"]["CourierSummaryResponseDto"];

export const orderStatuses: OrderStatus[] = [
  "NEW",
  "CONFIRMED",
  "SENT_TO_KITCHEN",
  "COOKING",
  "READY",
  "ASSIGNED_TO_COURIER",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CASH_RETURNED",
  "COMPLETED",
  "RECONCILED",
  "CANCELLED",
];

export const statusLabels: Record<OrderStatus, string> = {
  NEW: "Новый",
  CONFIRMED: "Подтверждён",
  SENT_TO_KITCHEN: "Передан на кухню",
  COOKING: "Готовится",
  READY: "Готов",
  ASSIGNED_TO_COURIER: "Назначен курьеру",
  OUT_FOR_DELIVERY: "Доставляется",
  DELIVERED: "Доставлен",
  CASH_RETURNED: "Наличные сданы",
  COMPLETED: "Закрыт оператором",
  RECONCILED: "Сверен бухгалтером",
  CANCELLED: "Отменён",
};

export const roleLabels: Record<Role, string> = {
  CUSTOMER: "Клиент",
  OPERATOR: "Оператор",
  COOK: "Повар",
  COURIER: "Курьер",
  ACCOUNTANT: "Бухгалтер",
  ADMIN: "Администратор",
  SUPER_ADMIN: "Главный администратор",
};

const nextByRole: Partial<
  Record<Role, Partial<Record<OrderStatus, OrderStatus>>>
> = {
  OPERATOR: {
    NEW: "CONFIRMED",
    CONFIRMED: "SENT_TO_KITCHEN",
    CASH_RETURNED: "COMPLETED",
  },
  COOK: {
    SENT_TO_KITCHEN: "COOKING",
    COOKING: "READY",
  },
  COURIER: {
    ASSIGNED_TO_COURIER: "OUT_FOR_DELIVERY",
    OUT_FOR_DELIVERY: "DELIVERED",
    DELIVERED: "CASH_RETURNED",
  },
  ACCOUNTANT: {
    COMPLETED: "RECONCILED",
  },
};

const adminNext: Partial<Record<OrderStatus, OrderStatus>> = {
  NEW: "CONFIRMED",
  CONFIRMED: "SENT_TO_KITCHEN",
  SENT_TO_KITCHEN: "COOKING",
  COOKING: "READY",
  ASSIGNED_TO_COURIER: "OUT_FOR_DELIVERY",
  OUT_FOR_DELIVERY: "DELIVERED",
  DELIVERED: "CASH_RETURNED",
  CASH_RETURNED: "COMPLETED",
  COMPLETED: "RECONCILED",
};

export function nextOrderStatus(role: Role, status: OrderStatus) {
  return role === "ADMIN" || role === "SUPER_ADMIN"
    ? adminNext[status]
    : nextByRole[role]?.[status];
}

export function canCancel(role: Role, status: OrderStatus) {
  return (
    ["OPERATOR", "ADMIN", "SUPER_ADMIN"].includes(role) &&
    ["NEW", "CONFIRMED", "SENT_TO_KITCHEN"].includes(status)
  );
}

export function canEditCourierAssignment(role: Role, status: OrderStatus) {
  return (
    ["OPERATOR", "ADMIN", "SUPER_ADMIN"].includes(role) &&
    status === "ASSIGNED_TO_COURIER"
  );
}

export function ratingStars(score: number) {
  const filled = Math.max(0, Math.min(5, Math.round(score)));
  return `${"★".repeat(filled)}${"☆".repeat(5 - filled)}`;
}

export function orderItemLabel(
  item: Pick<Order["items"][number], "productName" | "variantName">,
) {
  return item.variantName
    ? `${item.productName} · ${item.variantName}`
    : item.productName;
}
