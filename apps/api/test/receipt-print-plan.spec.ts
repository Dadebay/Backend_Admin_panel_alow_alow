import { describe, expect, it } from "vitest";
import { OrderStatus } from "../src/generated/prisma/client";
import { buildReceiptPrintPlan } from "../src/orders/receipt-print-plan";

describe("receipt print plan", () => {
  it("groups immutable order lines by printer IP and keeps missing routes visible", () => {
    const plan = buildReceiptPrintPlan(
      {
        id: "00000000-0000-4000-8000-000000000001",
        number: 42,
        status: OrderStatus.COOKING,
        cancellationReason: null,
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
            receiptPrinterPort: 80,
            receiptPrinterTransport: "JSPEED_HTTP",
            unitPrice: 25,
            quantity: 2,
          },
          {
            id: "00000000-0000-4000-8000-000000000012",
            productName: "Пицца",
            variantName: "Большая",
            receiptPrinterIp: "192.168.123.101",
            receiptPrinterPort: 80,
            receiptPrinterTransport: "JSPEED_HTTP",
            unitPrice: "75.00",
            quantity: 1,
          },
          {
            id: "00000000-0000-4000-8000-000000000013",
            productName: "Салат",
            variantName: null,
            receiptPrinterIp: "192.168.123.100",
            receiptPrinterPort: 80,
            receiptPrinterTransport: "JSPEED_HTTP",
            unitPrice: 15,
            quantity: 3,
          },
          {
            id: "00000000-0000-4000-8000-000000000014",
            productName: "Без маршрута",
            variantName: null,
            receiptPrinterIp: null,
            receiptPrinterPort: null,
            receiptPrinterTransport: null,
            unitPrice: 10,
            quantity: 1,
          },
        ],
      },
      {
        printerIp: "192.168.123.99",
        printerPort: 80,
        transport: "JSPEED_HTTP",
      },
    );

    expect(plan).toEqual({
      orderId: "00000000-0000-4000-8000-000000000001",
      orderNumber: 42,
      documentType: "ORDER",
      cancellationReason: null,
      summary: {
        subtotal: 140,
        discount: 10,
        deliveryFee: 15,
        total: 145,
        deliveryAreaName: "Мир 1",
      },
      mainJob: {
        printerIp: "192.168.123.99",
        printerPort: 80,
        transport: "JSPEED_HTTP",
        items: [
          {
            id: "00000000-0000-4000-8000-000000000011",
            name: "Плов",
            quantity: 2,
            unitPrice: 25,
          },
          {
            id: "00000000-0000-4000-8000-000000000012",
            name: "Пицца · Большая",
            quantity: 1,
            unitPrice: 75,
          },
          {
            id: "00000000-0000-4000-8000-000000000013",
            name: "Салат",
            quantity: 3,
            unitPrice: 15,
          },
          {
            id: "00000000-0000-4000-8000-000000000014",
            name: "Без маршрута",
            quantity: 1,
            unitPrice: 10,
          },
        ],
      },
      jobs: [
        {
          printerIp: "192.168.123.100",
          printerPort: 80,
          transport: "JSPEED_HTTP",
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
          printerPort: 80,
          transport: "JSPEED_HTTP",
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

  it("keeps the complete routed order on a cancellation print plan", () => {
    const plan = buildReceiptPrintPlan(
      {
        id: "00000000-0000-4000-8000-000000000002",
        number: 43,
        status: OrderStatus.CANCELLED,
        cancellationReason: "Клиент отменил заказ",
        subtotal: 50,
        discount: 0,
        deliveryFee: 15,
        total: 65,
        deliveryEtrapName: null,
        items: [
          {
            id: "00000000-0000-4000-8000-000000000021",
            productName: "Манты",
            variantName: null,
            receiptPrinterIp: "192.168.123.100",
            receiptPrinterPort: 9100,
            receiptPrinterTransport: "RAW_TCP",
            unitPrice: 25,
            quantity: 2,
          },
        ],
      },
      null,
    );

    expect(plan.documentType).toBe("CANCELLATION");
    expect(plan.cancellationReason).toBe("Клиент отменил заказ");
    expect(plan.jobs).toEqual([
      {
        printerIp: "192.168.123.100",
        printerPort: 9100,
        transport: "RAW_TCP",
        items: [
          expect.objectContaining({
            name: "Манты",
            quantity: 2,
            unitPrice: 25,
          }),
        ],
      },
    ]);
  });
});
