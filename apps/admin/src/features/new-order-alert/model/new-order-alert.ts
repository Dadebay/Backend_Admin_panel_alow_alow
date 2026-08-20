import type { Role } from "@/src/entities/order";

const alertRoles = new Set<Role>(["OPERATOR", "ADMIN", "SUPER_ADMIN"]);

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
