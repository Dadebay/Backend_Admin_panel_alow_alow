import {
  OrderStatus,
  ReceiptPrinterTransport,
} from "../generated/prisma/client";

export enum ReceiptDocumentType {
  ORDER = "ORDER",
  CANCELLATION = "CANCELLATION",
}

type ReceiptPrintSourceItem = {
  id: string;
  productName: string;
  variantName: string | null;
  receiptPrinterIp: string | null;
  receiptPrinterPort: number | null;
  receiptPrinterTransport: ReceiptPrinterTransport | null;
  unitPrice: unknown;
  quantity: number;
};

type ReceiptPrintSourceOrder = {
  id: string;
  number: number;
  status: OrderStatus;
  cancellationReason: string | null;
  subtotal: unknown;
  discount: unknown;
  deliveryFee: unknown;
  total: unknown;
  deliveryEtrapName: string | null;
  items: ReceiptPrintSourceItem[];
};

export type ReceiptPrintItem = {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
};

export type ReceiptPrinterJob = {
  printerIp: string;
  printerPort: number;
  transport: ReceiptPrinterTransport;
  items: ReceiptPrintItem[];
};

export type ReceiptPrinterEndpoint = Omit<ReceiptPrinterJob, "items">;

export type ReceiptPrintMetadata = {
  createdAt: string;
  businessPhone: string | null;
  branchName: string | null;
  customerName: string | null;
  customerPhone: string;
  address: string;
  addressDetails: string | null;
  customerNote: string | null;
};

export function buildReceiptPrintMetadata(
  order: {
    createdAt: Date;
    branchName: string | null;
    customer: {
      phone: string;
      firstName: string | null;
      lastName: string | null;
    };
    address: string;
    entrance: string | null;
    floor: string | null;
    apartment: string | null;
    customerNote: string | null;
  },
  businessPhone: string | null,
): ReceiptPrintMetadata {
  return {
    createdAt: order.createdAt.toISOString(),
    businessPhone,
    branchName: order.branchName,
    customerName:
      [order.customer.firstName, order.customer.lastName]
        .filter(Boolean)
        .join(" ")
        .trim() || null,
    customerPhone: order.customer.phone,
    address: order.address,
    addressDetails:
      [
        order.entrance ? `Подъезд: ${order.entrance}` : null,
        order.floor ? `Этаж: ${order.floor}` : null,
        order.apartment ? `Кв.: ${order.apartment}` : null,
      ]
        .filter(Boolean)
        .join(" · ") || null,
    customerNote: order.customerNote,
  };
}

function toPrintItem(item: ReceiptPrintSourceItem): ReceiptPrintItem {
  return {
    id: item.id,
    name: item.variantName
      ? `${item.productName} · ${item.variantName}`
      : item.productName,
    quantity: item.quantity,
    unitPrice: Number(item.unitPrice),
  };
}

export function buildReceiptPrintPlan(
  order: ReceiptPrintSourceOrder,
  mainPrinter: ReceiptPrinterEndpoint | null,
  metadata: ReceiptPrintMetadata | null = null,
) {
  const jobsByEndpoint = new Map<
    string,
    { endpoint: ReceiptPrinterEndpoint; items: ReceiptPrintItem[] }
  >();
  const unassignedItems: ReceiptPrintItem[] = [];
  const allItems: ReceiptPrintItem[] = [];

  for (const sourceItem of order.items) {
    const item = toPrintItem(sourceItem);
    allItems.push(item);
    if (!sourceItem.receiptPrinterIp) {
      unassignedItems.push(item);
      continue;
    }
    const endpoint = {
      printerIp: sourceItem.receiptPrinterIp,
      printerPort: sourceItem.receiptPrinterPort ?? 80,
      transport:
        sourceItem.receiptPrinterTransport ??
        ReceiptPrinterTransport.JSPEED_HTTP,
    };
    const key = `${endpoint.transport}:${endpoint.printerIp}:${endpoint.printerPort}`;
    const job = jobsByEndpoint.get(key) ?? { endpoint, items: [] };
    job.items.push(item);
    jobsByEndpoint.set(key, job);
  }

  return {
    orderId: order.id,
    orderNumber: order.number,
    metadata,
    documentType:
      order.status === OrderStatus.CANCELLED
        ? ReceiptDocumentType.CANCELLATION
        : ReceiptDocumentType.ORDER,
    cancellationReason:
      order.status === OrderStatus.CANCELLED
        ? order.cancellationReason?.trim() || null
        : null,
    summary: {
      subtotal: Number(order.subtotal),
      discount: Number(order.discount),
      deliveryFee: Number(order.deliveryFee),
      total: Number(order.total),
      deliveryAreaName: order.deliveryEtrapName,
    },
    mainJob: mainPrinter ? { ...mainPrinter, items: allItems } : null,
    jobs: [...jobsByEndpoint.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([, { endpoint, items }]) => ({ ...endpoint, items })),
    unassignedItems,
  };
}
