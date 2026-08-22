import { useMutation } from "@tanstack/react-query";
import type { components } from "@alowalow/api-contract";
import { useSession } from "@/src/shared/auth";

type ReceiptPrintPlan = components["schemas"]["ReceiptPrintPlanResponseDto"];

export type ReceiptPrintAgentResult = {
  orderId: string;
  orderNumber: number;
  printed: Array<{ printerIp: string; chunks: number }>;
  failed: Array<{ printerIp: string; message: string }>;
};

export class ReceiptPrintAgentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReceiptPrintAgentError";
  }
}

const DEFAULT_AGENT_URL = "http://127.0.0.1:17873";

export const RECEIPT_PRINT_AGENT_URL = (
  import.meta.env.VITE_RECEIPT_PRINT_AGENT_URL ?? DEFAULT_AGENT_URL
).replace(/\/+$/, "");

async function sendToReceiptPrintAgent(plan: ReceiptPrintPlan) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`${RECEIPT_PRINT_AGENT_URL}/v1/print`, {
      method: "POST",
      mode: "cors",
      cache: "no-store",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dispatchId: crypto.randomUUID(),
        orderId: plan.orderId,
        orderNumber: plan.orderNumber,
        summary: plan.summary,
        jobs: [...(plan.mainJob ? [plan.mainJob] : []), ...plan.jobs],
        unassignedItems: plan.unassignedItems,
      }),
    });
    const body = (await response.json().catch(() => null)) as
      | (ReceiptPrintAgentResult & { message?: string })
      | null;
    if (!response.ok || !body) {
      const failedPrinters = body?.failed
        .map(({ printerIp, message }) => `${printerIp}: ${message}`)
        .join("; ");
      throw new ReceiptPrintAgentError(
        failedPrinters ||
          body?.message ||
          "Программа печати не приняла заказ. Проверьте, что она запущена.",
      );
    }
    return body;
  } catch (error) {
    if (error instanceof ReceiptPrintAgentError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ReceiptPrintAgentError(
        "Программа печати не ответила за 8 секунд.",
      );
    }
    throw new ReceiptPrintAgentError(
      "Нет связи с программой печати на этом компьютере.",
    );
  } finally {
    window.clearTimeout(timeout);
  }
}

export function useReceiptPrinting() {
  const { authorizedRequest } = useSession();
  return useMutation({
    mutationFn: async (orderId: string) => {
      const plan = await authorizedRequest<ReceiptPrintPlan>(
        `/orders/${orderId}/receipt-print-plan`,
      );
      if (!plan.mainJob && plan.jobs.length === 0) {
        throw new ReceiptPrintAgentError(
          "Не указан ни главный аппарат, ни кухонный маршрут для блюд заказа.",
        );
      }
      const result = await sendToReceiptPrintAgent(plan);
      return { plan, result };
    },
    retry: false,
  });
}
