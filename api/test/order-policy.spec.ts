import { describe, expect, it } from "vitest";
import { OrderStatus, Role } from "../src/generated/prisma/client";
import {
  allowedOrderTransitions,
  assertOrderTransition,
  canCancelOrder,
} from "../src/orders/order-policy";

describe("order workflow policy", () => {
  const expected = new Map<string, OrderStatus>([
    [`${OrderStatus.NEW}:${Role.OPERATOR}`, OrderStatus.CONFIRMED],
    [`${OrderStatus.NEW}:${Role.ADMIN}`, OrderStatus.CONFIRMED],
    [`${OrderStatus.CONFIRMED}:${Role.OPERATOR}`, OrderStatus.SENT_TO_KITCHEN],
    [`${OrderStatus.CONFIRMED}:${Role.ADMIN}`, OrderStatus.SENT_TO_KITCHEN],
    [`${OrderStatus.SENT_TO_KITCHEN}:${Role.COOK}`, OrderStatus.COOKING],
    [`${OrderStatus.SENT_TO_KITCHEN}:${Role.ADMIN}`, OrderStatus.COOKING],
    [`${OrderStatus.COOKING}:${Role.COOK}`, OrderStatus.READY],
    [`${OrderStatus.COOKING}:${Role.ADMIN}`, OrderStatus.READY],
    [
      `${OrderStatus.ASSIGNED_TO_COURIER}:${Role.COURIER}`,
      OrderStatus.OUT_FOR_DELIVERY,
    ],
    [
      `${OrderStatus.ASSIGNED_TO_COURIER}:${Role.ADMIN}`,
      OrderStatus.OUT_FOR_DELIVERY,
    ],
    [`${OrderStatus.OUT_FOR_DELIVERY}:${Role.COURIER}`, OrderStatus.DELIVERED],
    [`${OrderStatus.OUT_FOR_DELIVERY}:${Role.ADMIN}`, OrderStatus.DELIVERED],
    [`${OrderStatus.DELIVERED}:${Role.COURIER}`, OrderStatus.CASH_RETURNED],
    [`${OrderStatus.DELIVERED}:${Role.ADMIN}`, OrderStatus.CASH_RETURNED],
    [`${OrderStatus.CASH_RETURNED}:${Role.OPERATOR}`, OrderStatus.COMPLETED],
    [`${OrderStatus.CASH_RETURNED}:${Role.ADMIN}`, OrderStatus.COMPLETED],
    [`${OrderStatus.COMPLETED}:${Role.ACCOUNTANT}`, OrderStatus.RECONCILED],
    [`${OrderStatus.COMPLETED}:${Role.ADMIN}`, OrderStatus.RECONCILED],
  ]);

  it("keeps the complete status and role matrix deny-by-default", () => {
    for (const status of Object.values(OrderStatus)) {
      for (const role of Object.values(Role)) {
        const target = expected.get(`${status}:${role}`);
        expect(
          allowedOrderTransitions(status, role),
          `${role} from ${status}`,
        ).toEqual(target ? [target] : []);
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

  it("allows cancellation only for the owner or authorized pre-kitchen staff", () => {
    for (const status of Object.values(OrderStatus)) {
      for (const role of Object.values(Role)) {
        for (const isOwner of [false, true]) {
          const expectedCancellation =
            (role === Role.CUSTOMER && isOwner && status === OrderStatus.NEW) ||
            (([Role.OPERATOR, Role.ADMIN] as Role[]).includes(role) &&
              [OrderStatus.NEW, OrderStatus.CONFIRMED].includes(status));
          expect(
            canCancelOrder(status, role, isOwner),
            `${role} from ${status}, owner=${String(isOwner)}`,
          ).toBe(expectedCancellation);
        }
      }
    }
  });
});
