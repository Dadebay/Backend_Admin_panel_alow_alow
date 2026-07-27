import { ForbiddenException } from "@nestjs/common";
import { OrderStatus, Role } from "../generated/prisma/client";

const transitions: Partial<Record<OrderStatus, Partial<Record<Role, OrderStatus[]>>>> =
  {
    [OrderStatus.NEW]: {
      [Role.OPERATOR]: [OrderStatus.CONFIRMED],
      [Role.ADMIN]: [OrderStatus.CONFIRMED],
    },
    [OrderStatus.CONFIRMED]: {
      [Role.OPERATOR]: [OrderStatus.SENT_TO_KITCHEN],
      [Role.ADMIN]: [OrderStatus.SENT_TO_KITCHEN],
    },
    [OrderStatus.SENT_TO_KITCHEN]: {
      [Role.COOK]: [OrderStatus.COOKING],
      [Role.ADMIN]: [OrderStatus.COOKING],
    },
    [OrderStatus.COOKING]: {
      [Role.COOK]: [OrderStatus.READY],
      [Role.ADMIN]: [OrderStatus.READY],
    },
    [OrderStatus.ASSIGNED_TO_COURIER]: {
      [Role.COURIER]: [OrderStatus.OUT_FOR_DELIVERY],
      [Role.ADMIN]: [OrderStatus.OUT_FOR_DELIVERY],
    },
    [OrderStatus.OUT_FOR_DELIVERY]: {
      [Role.COURIER]: [OrderStatus.DELIVERED],
      [Role.ADMIN]: [OrderStatus.DELIVERED],
    },
    [OrderStatus.DELIVERED]: {
      [Role.COURIER]: [OrderStatus.CASH_RETURNED],
      [Role.ADMIN]: [OrderStatus.CASH_RETURNED],
    },
    [OrderStatus.CASH_RETURNED]: {
      [Role.OPERATOR]: [OrderStatus.COMPLETED],
      [Role.ADMIN]: [OrderStatus.COMPLETED],
    },
    [OrderStatus.COMPLETED]: {
      [Role.ACCOUNTANT]: [OrderStatus.RECONCILED],
      [Role.ADMIN]: [OrderStatus.RECONCILED],
    },
  };

export function allowedOrderTransitions(
  status: OrderStatus,
  role: Role,
): OrderStatus[] {
  return transitions[status]?.[role] ?? [];
}

export function assertOrderTransition(
  status: OrderStatus,
  target: OrderStatus,
  role: Role,
) {
  if (!allowedOrderTransitions(status, role).includes(target)) {
    throw new ForbiddenException(
      `Role ${role} cannot move an order from ${status} to ${target}`,
    );
  }
}

export function canCancelOrder(
  status: OrderStatus,
  role: Role,
  isOwner: boolean,
) {
  if (role === Role.CUSTOMER) {
    return isOwner && status === OrderStatus.NEW;
  }
  const isStaff = role === Role.OPERATOR || role === Role.ADMIN;
  const isBeforeKitchen =
    status === OrderStatus.NEW || status === OrderStatus.CONFIRMED;
  return isStaff && isBeforeKitchen;
}
