import { describe, expect, it } from "vitest";
import { OrderStatus, Role } from "../src/generated/prisma/client";
import {
  allowedOrderTransitions,
  assertOrderTransition,
  canAdministratorEditOrder,
  canCancelOrder,
  canEditCourierAssignment,
  canManageCourierAssignment,
} from "../src/orders/order-policy";

describe("order workflow policy", () => {
  const expected = new Map<string, OrderStatus | OrderStatus[]>([
    [`${OrderStatus.NEW}:${Role.OPERATOR}`, OrderStatus.CONFIRMED],
    [`${OrderStatus.NEW}:${Role.ADMIN}`, OrderStatus.CONFIRMED],
    [`${OrderStatus.NEW}:${Role.SUPER_ADMIN}`, OrderStatus.CONFIRMED],
    [`${OrderStatus.CONFIRMED}:${Role.OPERATOR}`, OrderStatus.SENT_TO_KITCHEN],
    [
      `${OrderStatus.CONFIRMED}:${Role.ADMIN}`,
      [OrderStatus.NEW, OrderStatus.SENT_TO_KITCHEN],
    ],
    [
      `${OrderStatus.CONFIRMED}:${Role.SUPER_ADMIN}`,
      [OrderStatus.NEW, OrderStatus.SENT_TO_KITCHEN],
    ],
    [
      `${OrderStatus.SENT_TO_KITCHEN}:${Role.COOK}`,
      [OrderStatus.COOKING, OrderStatus.READY],
    ],
    [
      `${OrderStatus.SENT_TO_KITCHEN}:${Role.ADMIN}`,
      [OrderStatus.CONFIRMED, OrderStatus.COOKING, OrderStatus.READY],
    ],
    [
      `${OrderStatus.SENT_TO_KITCHEN}:${Role.SUPER_ADMIN}`,
      [OrderStatus.CONFIRMED, OrderStatus.COOKING, OrderStatus.READY],
    ],
    [`${OrderStatus.COOKING}:${Role.COOK}`, OrderStatus.READY],
    [
      `${OrderStatus.COOKING}:${Role.ADMIN}`,
      [OrderStatus.SENT_TO_KITCHEN, OrderStatus.READY],
    ],
    [
      `${OrderStatus.COOKING}:${Role.SUPER_ADMIN}`,
      [OrderStatus.SENT_TO_KITCHEN, OrderStatus.READY],
    ],
    [`${OrderStatus.READY}:${Role.ADMIN}`, OrderStatus.COOKING],
    [`${OrderStatus.READY}:${Role.SUPER_ADMIN}`, OrderStatus.COOKING],
    [
      `${OrderStatus.ASSIGNED_TO_COURIER}:${Role.COURIER}`,
      OrderStatus.OUT_FOR_DELIVERY,
    ],
    [
      `${OrderStatus.ASSIGNED_TO_COURIER}:${Role.ADMIN}`,
      [OrderStatus.READY, OrderStatus.OUT_FOR_DELIVERY],
    ],
    [
      `${OrderStatus.ASSIGNED_TO_COURIER}:${Role.SUPER_ADMIN}`,
      [OrderStatus.READY, OrderStatus.OUT_FOR_DELIVERY],
    ],
    [`${OrderStatus.OUT_FOR_DELIVERY}:${Role.COURIER}`, OrderStatus.DELIVERED],
    [
      `${OrderStatus.OUT_FOR_DELIVERY}:${Role.ADMIN}`,
      OrderStatus.DELIVERED,
    ],
    [
      `${OrderStatus.OUT_FOR_DELIVERY}:${Role.SUPER_ADMIN}`,
      OrderStatus.DELIVERED,
    ],
    [`${OrderStatus.DELIVERED}:${Role.COURIER}`, OrderStatus.CASH_RETURNED],
    [
      `${OrderStatus.DELIVERED}:${Role.ADMIN}`,
      OrderStatus.CASH_RETURNED,
    ],
    [
      `${OrderStatus.DELIVERED}:${Role.SUPER_ADMIN}`,
      OrderStatus.CASH_RETURNED,
    ],
    [`${OrderStatus.CASH_RETURNED}:${Role.OPERATOR}`, OrderStatus.COMPLETED],
    [`${OrderStatus.CASH_RETURNED}:${Role.ADMIN}`, OrderStatus.COMPLETED],
    [`${OrderStatus.CASH_RETURNED}:${Role.SUPER_ADMIN}`, OrderStatus.COMPLETED],
    [`${OrderStatus.COMPLETED}:${Role.ACCOUNTANT}`, OrderStatus.RECONCILED],
    [`${OrderStatus.COMPLETED}:${Role.ADMIN}`, OrderStatus.RECONCILED],
    [`${OrderStatus.COMPLETED}:${Role.SUPER_ADMIN}`, OrderStatus.RECONCILED],
  ]);

  it("keeps the complete status and role matrix deny-by-default", () => {
    for (const status of Object.values(OrderStatus)) {
      for (const role of Object.values(Role)) {
        const target = expected.get(`${status}:${role}`);
        expect(
          allowedOrderTransitions(status, role),
          `${role} from ${status}`,
        ).toEqual(target ? (Array.isArray(target) ? target : [target]) : []);
      }
    }
  });

  it("throws on a forbidden workflow transition", () => {
    expect(() =>
      assertOrderTransition(
        OrderStatus.COOKING,
        OrderStatus.READY,
        Role.COURIER,
      ),
    ).toThrow("cannot move an order");
  });

  it("forbids every backward transition after courier pickup", () => {
    for (const role of [Role.ADMIN, Role.SUPER_ADMIN]) {
      expect(() =>
        assertOrderTransition(
          OrderStatus.OUT_FOR_DELIVERY,
          OrderStatus.ASSIGNED_TO_COURIER,
          role,
        ),
      ).toThrow("cannot move an order");
      expect(() =>
        assertOrderTransition(
          OrderStatus.DELIVERED,
          OrderStatus.OUT_FOR_DELIVERY,
          role,
        ),
      ).toThrow("cannot move an order");
    }
  });

  it("keeps operators early-only while administrators may cancel active unsettled orders", () => {
    for (const status of Object.values(OrderStatus)) {
      for (const role of Object.values(Role)) {
        for (const isOwner of [false, true]) {
          const expectedCancellation =
            (role === Role.CUSTOMER && isOwner && status === OrderStatus.NEW) ||
            (role === Role.OPERATOR &&
              [
                OrderStatus.NEW,
                OrderStatus.CONFIRMED,
                OrderStatus.SENT_TO_KITCHEN,
              ].includes(status)) ||
            ((role === Role.ADMIN || role === Role.SUPER_ADMIN) &&
              [
                OrderStatus.NEW,
                OrderStatus.CONFIRMED,
                OrderStatus.SENT_TO_KITCHEN,
                OrderStatus.COOKING,
                OrderStatus.READY,
                OrderStatus.ASSIGNED_TO_COURIER,
                OrderStatus.OUT_FOR_DELIVERY,
                OrderStatus.DELIVERED,
              ].includes(status));
          expect(
            canCancelOrder(status, role, isOwner),
            `${role} from ${status}, owner=${String(isOwner)}`,
          ).toBe(expectedCancellation);
        }
      }
    }
  });

  it("allows only administrators to edit before courier pickup", () => {
    for (const status of Object.values(OrderStatus)) {
      for (const role of Object.values(Role)) {
        expect(canAdministratorEditOrder(status, role)).toBe(
          (role === Role.ADMIN || role === Role.SUPER_ADMIN) &&
            [
              OrderStatus.NEW,
              OrderStatus.CONFIRMED,
              OrderStatus.SENT_TO_KITCHEN,
              OrderStatus.COOKING,
              OrderStatus.READY,
              OrderStatus.ASSIGNED_TO_COURIER,
            ].includes(status),
        );
      }
    }
  });

  it("allows only dispatch roles to correct an assignment before delivery", () => {
    for (const role of Object.values(Role)) {
      expect(canManageCourierAssignment(role), role).toBe(
        [Role.OPERATOR, Role.ADMIN, Role.SUPER_ADMIN].includes(role),
      );
    }
    for (const status of Object.values(OrderStatus)) {
      expect(canEditCourierAssignment(status), status).toBe(
        [OrderStatus.READY, OrderStatus.ASSIGNED_TO_COURIER].includes(status),
      );
    }
  });
});
