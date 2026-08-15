import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/src/shared/auth";
import type {
  Courier,
  Order,
  OrderList,
  OrderStatus,
} from "../model/types";

export const orderQueryKeys = {
  all: ["orders"] as const,
  list: (
    userId: string,
    params: {
      status?: OrderStatus;
      statuses?: OrderStatus[];
      branchId?: string;
      search?: string;
      page: number;
      limit: number;
    },
  ) => [...orderQueryKeys.all, "list", userId, params] as const,
  detail: (userId: string, orderId: string) =>
    [...orderQueryKeys.all, "detail", userId, orderId] as const,
  couriers: (userId: string) =>
    [...orderQueryKeys.all, "couriers", userId] as const,
};

export function useOrders(params: {
  status?: OrderStatus;
  statuses?: OrderStatus[];
  branchId?: string;
  search?: string;
  page: number;
  limit?: number;
}) {
  const { session, authorizedRequest } = useSession();
  const normalized = {
    ...params,
    search: params.search?.trim() || undefined,
    limit: params.limit ?? 25,
  };
  return useQuery({
    queryKey: orderQueryKeys.list(session?.user.id ?? "anonymous", normalized),
    queryFn: ({ signal }) => {
      const query = new URLSearchParams({
        page: String(normalized.page),
        limit: String(normalized.limit),
      });
      if (normalized.status) query.set("status", normalized.status);
      if (normalized.statuses?.length) {
        query.set("statuses", normalized.statuses.join(","));
      }
      if (normalized.branchId) query.set("branchId", normalized.branchId);
      if (normalized.search) query.set("search", normalized.search);
      return authorizedRequest<OrderList>(`/orders?${query}`, { signal });
    },
    enabled: Boolean(session),
    staleTime: 5_000,
    refetchInterval: () =>
      typeof document !== "undefined" &&
      document.visibilityState === "visible"
        ? 12_000
        : false,
    refetchIntervalInBackground: false,
  });
}

export function useOrder(orderId: string | null) {
  const { session, authorizedRequest } = useSession();
  const normalizedId = orderId ?? "";
  return useQuery({
    queryKey: orderQueryKeys.detail(
      session?.user.id ?? "anonymous",
      normalizedId,
    ),
    queryFn: ({ signal }) =>
      authorizedRequest<Order>(`/orders/${normalizedId}`, { signal }),
    enabled: Boolean(session && orderId),
    staleTime: 10_000,
  });
}

export function useCouriers() {
  const { session, authorizedRequest } = useSession();
  return useQuery({
    queryKey: orderQueryKeys.couriers(session?.user.id ?? "anonymous"),
    queryFn: ({ signal }) =>
      authorizedRequest<Courier[]>("/staff/couriers", { signal }),
    enabled: Boolean(
      session &&
        ["OPERATOR", "ADMIN", "SUPER_ADMIN"].includes(session.user.role),
    ),
    staleTime: 30_000,
  });
}
