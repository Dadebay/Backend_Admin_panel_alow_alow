type ReceiptPrintSourceItem = {
  id: string;
  productName: string;
  variantName: string | null;
  receiptPrinterIp: string | null;
  unitPrice: unknown;
  quantity: number;
};

type ReceiptPrintSourceOrder = {
  id: string;
  number: number;
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
  items: ReceiptPrintItem[];
};

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

export function buildReceiptPrintPlan(order: ReceiptPrintSourceOrder) {
  const jobsByIp = new Map<string, ReceiptPrintItem[]>();
  const unassignedItems: ReceiptPrintItem[] = [];

  for (const sourceItem of order.items) {
    const item = toPrintItem(sourceItem);
    if (!sourceItem.receiptPrinterIp) {
      unassignedItems.push(item);
      continue;
    }
    const items = jobsByIp.get(sourceItem.receiptPrinterIp) ?? [];
    items.push(item);
    jobsByIp.set(sourceItem.receiptPrinterIp, items);
  }

  return {
    orderId: order.id,
    orderNumber: order.number,
    jobs: [...jobsByIp.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([printerIp, items]) => ({ printerIp, items })),
    unassignedItems,
  };
}
