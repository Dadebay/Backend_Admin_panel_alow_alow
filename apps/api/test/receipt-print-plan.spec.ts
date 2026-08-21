import { describe, expect, it } from "vitest";
import { buildReceiptPrintPlan } from "../src/orders/receipt-print-plan";

describe("receipt print plan", () => {
  it("groups immutable order lines by printer IP and keeps missing routes visible", () => {
    const plan = buildReceiptPrintPlan({
      id: "00000000-0000-4000-8000-000000000001",
      number: 42,
      subtotal: 140,
      discount: 10,
      deliveryFee: 15,
      total: 145,
      deliveryEtrapName: "Мир 1",
      items: [
        {
          id: "00000000-0000-4000-8000-000000000011",
          productName: "Плов",
          variantName: null,
          receiptPrinterIp: "192.168.123.100",
          unitPrice: 25,
          quantity: 2,
        },
        {
          id: "00000000-0000-4000-8000-000000000012",
          productName: "Пицца",
          variantName: "Большая",
          receiptPrinterIp: "192.168.123.101",
          unitPrice: "75.00",
          quantity: 1,
        },
        {
          id: "00000000-0000-4000-8000-000000000013",
          productName: "Салат",
          variantName: null,
          receiptPrinterIp: "192.168.123.100",
          unitPrice: 15,
          quantity: 3,
        },
        {
          id: "00000000-0000-4000-8000-000000000014",
          productName: "Без маршрута",
          variantName: null,
          receiptPrinterIp: null,
          unitPrice: 10,
          quantity: 1,
        },
      ],
    });

    expect(plan).toEqual({
      orderId: "00000000-0000-4000-8000-000000000001",
      orderNumber: 42,
      summary: {
        subtotal: 140,
        discount: 10,
        deliveryFee: 15,
        total: 145,
        deliveryAreaName: "Мир 1",
      },
      jobs: [
        {
          printerIp: "192.168.123.100",
          items: [
            {
              id: "00000000-0000-4000-8000-000000000011",
              name: "Плов",
              quantity: 2,
              unitPrice: 25,
            },
            {
              id: "00000000-0000-4000-8000-000000000013",
              name: "Салат",
              quantity: 3,
              unitPrice: 15,
            },
          ],
        },
        {
          printerIp: "192.168.123.101",
          items: [
            {
              id: "00000000-0000-4000-8000-000000000012",
              name: "Пицца · Большая",
              quantity: 1,
              unitPrice: 75,
            },
          ],
        },
      ],
      unassignedItems: [
        {
          id: "00000000-0000-4000-8000-000000000014",
          name: "Без маршрута",
          quantity: 1,
          unitPrice: 10,
        },
      ],
    });
  });
});
