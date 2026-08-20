import type { Role } from "@/src/entities/order";

const alertRoles = new Set<Role>(["OPERATOR", "ADMIN", "SUPER_ADMIN"]);
const automaticPrintStorageKey = "a7-tagam:auto-printed-order-ids";
const automaticPrintHistoryLimit = 200;

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export function canReceiveNewOrderAlerts(role: Role) {
  return alertRoles.has(role);
}

export function collectNewItems<T extends { id: string }>(
  previousIds: ReadonlySet<string> | null,
  currentItems: readonly T[],
) {
  if (!previousIds) return [];
  return currentItems.filter((item) => !previousIds.has(item.id));
}

export function claimAutomaticReceiptPrint(
  storage: StorageLike,
  orderId: string,
) {
  let claimedIds: string[] = [];
  try {
    const stored = storage.getItem(automaticPrintStorageKey);
    const parsed = stored ? (JSON.parse(stored) as unknown) : [];
    if (Array.isArray(parsed)) {
      claimedIds = parsed.filter(
        (item): item is string => typeof item === "string",
      );
    }
  } catch {
    claimedIds = [];
  }

  if (claimedIds.includes(orderId)) return false;
  storage.setItem(
    automaticPrintStorageKey,
    JSON.stringify([...claimedIds, orderId].slice(-automaticPrintHistoryLimit)),
  );
  return true;
}
