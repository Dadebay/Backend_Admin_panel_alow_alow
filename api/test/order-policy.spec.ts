import { describe, expect, it } from "vitest";
import { OrderStatus, Role } from "../src/generated/prisma/client";
import {
  allowedOrderTransitions,
  canCancelOrder,
} from "../src/orders/order-policy";

describe("order workflow policy", () => {
  it("keeps each operational step role-gated", () => {
    expect(
      allowedOrderTransitions(OrderStatus.COOKING, Role.COOK),
    ).toEqual([OrderStatus.READY]);
    expect(
      allowedOrderTransitions(OrderStatus.COOKING, Role.COURIER),
    ).toEqual([]);
    expect(
      allowedOrderTransitions(OrderStatus.COMPLETED, Role.ACCOUNTANT),
    ).toEqual([OrderStatus.RECONCILED]);
  });

  it("allows cancellation only before kitchen handoff", () => {
    expect(canCancelOrder(OrderStatus.NEW, Role.CUSTOMER, true)).toBe(true);
    expect(canCancelOrder(OrderStatus.CONFIRMED, Role.OPERATOR, false)).toBe(
      true,
    );
    expect(
      canCancelOrder(OrderStatus.SENT_TO_KITCHEN, Role.ADMIN, false),
    ).toBe(false);
  });
});
