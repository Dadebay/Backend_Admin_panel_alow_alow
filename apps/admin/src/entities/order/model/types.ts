import type { components } from "@alowalow/api-contract";

export type Order = components["schemas"]["OrderResponseDto"];
export type OrderList = components["schemas"]["OrderListResponseDto"];
export type OrderStatus = Order["status"];
export type Role = components["schemas"]["Role"];
export type Courier = components["schemas"]["CourierSummaryResponseDto"];

export const orderStatuses: OrderStatus[] = [
  "COOKING",
  "READY",
  "ASSIGNED_TO_COURIER",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CASH_RETURNED",
  "RECONCILED",
  "CANCELLED",
];

export const statusLabels: Record<OrderStatus, string> = {
  COOKING: "Готовится",
  READY: "Готов",
  ASSIGNED_TO_COURIER: "Назначен курьеру",
  OUT_FOR_DELIVERY: "Доставляется",
  DELIVERED: "Доставлен",
  CASH_RETURNED: "Завершён · наличные сданы",
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
  COOK: {
    COOKING: "READY",
  },
  COURIER: {
    ASSIGNED_TO_COURIER: "OUT_FOR_DELIVERY",
    OUT_FOR_DELIVERY: "DELIVERED",
    DELIVERED: "CASH_RETURNED",
  },
};

const adminNext: Partial<Record<OrderStatus, OrderStatus>> = {
  COOKING: "READY",
  ASSIGNED_TO_COURIER: "OUT_FOR_DELIVERY",
  OUT_FOR_DELIVERY: "DELIVERED",
  DELIVERED: "CASH_RETURNED",
};

export function nextOrderStatus(role: Role, status: OrderStatus) {
  if (role === "SUPER_ADMIN" && status === "CASH_RETURNED") {
    return "RECONCILED";
  }
  return role === "ADMIN" || role === "SUPER_ADMIN"
    ? adminNext[status]
    : nextByRole[role]?.[status];
}

export function canCancel(role: Role, status: OrderStatus) {
  return (
    ["ADMIN", "SUPER_ADMIN"].includes(role) &&
    [
      "COOKING",
      "READY",
      "ASSIGNED_TO_COURIER",
      "OUT_FOR_DELIVERY",
      "DELIVERED",
    ].includes(status)
  );
}

const previousByStatus: Partial<Record<OrderStatus, OrderStatus>> = {
  READY: "COOKING",
  ASSIGNED_TO_COURIER: "READY",
};

export function previousOrderStatus(role: Role, status: OrderStatus) {
  return role === "ADMIN" || role === "SUPER_ADMIN"
    ? previousByStatus[status]
    : undefined;
}

export function canAdministratorEditOrder(role: Role, status: OrderStatus) {
  return (
    ["ADMIN", "SUPER_ADMIN"].includes(role) &&
    ["COOKING", "READY", "ASSIGNED_TO_COURIER"].includes(status)
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
