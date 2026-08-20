import { ForbiddenException } from "@nestjs/common";
import { OrderStatus, Role } from "../generated/prisma/client";

const transitions: Partial<
  Record<OrderStatus, Partial<Record<Role, OrderStatus[]>>>
> = {
  [OrderStatus.NEW]: {
    [Role.OPERATOR]: [OrderStatus.CONFIRMED],
    [Role.ADMIN]: [OrderStatus.CONFIRMED],
    [Role.SUPER_ADMIN]: [OrderStatus.CONFIRMED],
  },
  [OrderStatus.CONFIRMED]: {
    [Role.OPERATOR]: [OrderStatus.SENT_TO_KITCHEN],
    [Role.ADMIN]: [OrderStatus.SENT_TO_KITCHEN],
    [Role.SUPER_ADMIN]: [OrderStatus.SENT_TO_KITCHEN],
  },
  [OrderStatus.SENT_TO_KITCHEN]: {
    [Role.COOK]: [OrderStatus.COOKING, OrderStatus.READY],
    [Role.ADMIN]: [OrderStatus.COOKING, OrderStatus.READY],
    [Role.SUPER_ADMIN]: [OrderStatus.COOKING, OrderStatus.READY],
  },
  [OrderStatus.COOKING]: {
    [Role.COOK]: [OrderStatus.READY],
    [Role.ADMIN]: [OrderStatus.READY],
    [Role.SUPER_ADMIN]: [OrderStatus.READY],
  },
  [OrderStatus.ASSIGNED_TO_COURIER]: {
    [Role.COURIER]: [OrderStatus.OUT_FOR_DELIVERY],
    [Role.ADMIN]: [OrderStatus.OUT_FOR_DELIVERY],
    [Role.SUPER_ADMIN]: [OrderStatus.OUT_FOR_DELIVERY],
  },
  [OrderStatus.OUT_FOR_DELIVERY]: {
    [Role.COURIER]: [OrderStatus.DELIVERED],
    [Role.ADMIN]: [OrderStatus.DELIVERED],
    [Role.SUPER_ADMIN]: [OrderStatus.DELIVERED],
  },
  [OrderStatus.DELIVERED]: {
    [Role.COURIER]: [OrderStatus.CASH_RETURNED],
    [Role.ADMIN]: [OrderStatus.CASH_RETURNED],
    [Role.SUPER_ADMIN]: [OrderStatus.CASH_RETURNED],
  },
  [OrderStatus.CASH_RETURNED]: {
    [Role.OPERATOR]: [OrderStatus.COMPLETED],
    [Role.ADMIN]: [OrderStatus.COMPLETED],
    [Role.SUPER_ADMIN]: [OrderStatus.COMPLETED],
  },
  [OrderStatus.COMPLETED]: {
    [Role.ACCOUNTANT]: [OrderStatus.RECONCILED],
    [Role.ADMIN]: [OrderStatus.RECONCILED],
    [Role.SUPER_ADMIN]: [OrderStatus.RECONCILED],
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
  const cancellationRoles: Role[] = [
    Role.OPERATOR,
    Role.ADMIN,
    Role.SUPER_ADMIN,
  ];
  const cancellableStatuses: OrderStatus[] = [
    OrderStatus.NEW,
    OrderStatus.CONFIRMED,
    OrderStatus.SENT_TO_KITCHEN,
  ];
  return (
    cancellationRoles.includes(role) && cancellableStatuses.includes(status)
  );
}

const courierAssignmentRoles: Role[] = [
  Role.OPERATOR,
  Role.ADMIN,
  Role.SUPER_ADMIN,
];

const courierAssignmentStatuses: OrderStatus[] = [
  OrderStatus.READY,
  OrderStatus.ASSIGNED_TO_COURIER,
];

export function canManageCourierAssignment(role: Role) {
  return courierAssignmentRoles.includes(role);
}

export function canEditCourierAssignment(status: OrderStatus) {
  return courierAssignmentStatuses.includes(status);
}
