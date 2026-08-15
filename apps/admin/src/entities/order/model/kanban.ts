import type { OrderStatus, Role } from "./types";

export type OrderKanbanLaneId =
  | "incoming"
  | "kitchen-queue"
  | "cooking"
  | "ready"
  | "assigned"
  | "delivery"
  | "cash"
  | "closing"
  | "cancelled";

export type OrderKanbanLane = {
  id: OrderKanbanLaneId;
  title: string;
  responsibility: string;
  statuses: OrderStatus[];
};

export type OrderCardField =
  | "customer"
  | "delivery"
  | "branch"
  | "items"
  | "cash"
  | "courier";

export const orderKanbanLanes: OrderKanbanLane[] = [
  {
    id: "incoming",
    title: "Получены",
    responsibility: "Оператор",
    statuses: ["NEW", "CONFIRMED"],
  },
  {
    id: "kitchen-queue",
    title: "Очередь кухни",
    responsibility: "Повар",
    statuses: ["SENT_TO_KITCHEN"],
  },
  {
    id: "cooking",
    title: "Готовятся",
    responsibility: "Повар",
    statuses: ["COOKING"],
  },
  {
    id: "ready",
    title: "Готовы",
    responsibility: "Оператор",
    statuses: ["READY"],
  },
  {
    id: "assigned",
    title: "Назначены",
    responsibility: "Курьер",
    statuses: ["ASSIGNED_TO_COURIER"],
  },
  {
    id: "delivery",
    title: "В пути",
    responsibility: "Курьер",
    statuses: ["OUT_FOR_DELIVERY"],
  },
  {
    id: "cash",
    title: "Доставка и наличные",
    responsibility: "Курьер → оператор",
    statuses: ["DELIVERED", "CASH_RETURNED"],
  },
  {
    id: "closing",
    title: "Закрытие",
    responsibility: "Оператор → бухгалтер",
    statuses: ["COMPLETED", "RECONCILED"],
  },
  {
    id: "cancelled",
    title: "Отменены",
    responsibility: "История",
    statuses: ["CANCELLED"],
  },
];

const fullFlowRoles = new Set<Role>([
  "OPERATOR",
  "ACCOUNTANT",
  "ADMIN",
  "SUPER_ADMIN",
]);

const laneIdsByRole: Partial<Record<Role, Set<OrderKanbanLaneId>>> = {
  COOK: new Set(["kitchen-queue", "cooking", "ready"]),
  COURIER: new Set(["assigned", "delivery", "cash"]),
};

const queueStatusesByRole: Partial<Record<Role, OrderStatus[]>> = {
  COOK: ["SENT_TO_KITCHEN", "COOKING", "READY"],
  COURIER: [
    "ASSIGNED_TO_COURIER",
    "OUT_FOR_DELIVERY",
    "DELIVERED",
    "CASH_RETURNED",
  ],
};

const cardFieldsByRole: Record<Role, Set<OrderCardField>> = {
  CUSTOMER: new Set(),
  OPERATOR: new Set([
    "customer",
    "delivery",
    "branch",
    "items",
    "cash",
    "courier",
  ]),
  COOK: new Set(["branch", "items"]),
  COURIER: new Set([
    "customer",
    "delivery",
    "branch",
    "items",
    "cash",
  ]),
  ACCOUNTANT: new Set(["branch", "cash", "courier"]),
  ADMIN: new Set([
    "customer",
    "delivery",
    "branch",
    "items",
    "cash",
    "courier",
  ]),
  SUPER_ADMIN: new Set([
    "customer",
    "delivery",
    "branch",
    "items",
    "cash",
    "courier",
  ]),
};

export function kanbanLanesForRole(role: Role) {
  if (fullFlowRoles.has(role)) return orderKanbanLanes;
  const laneIds = laneIdsByRole[role];
  return laneIds
    ? orderKanbanLanes.filter((lane) => laneIds.has(lane.id))
    : [];
}

export function orderCardFieldsForRole(role: Role) {
  return cardFieldsByRole[role];
}

export function kanbanQueueStatusesForRole(role: Role) {
  return queueStatusesByRole[role];
}

export function roleCanUseOrderTable(role: Role) {
  return ["OPERATOR", "ADMIN", "SUPER_ADMIN"].includes(role);
}
