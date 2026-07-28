"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { components } from "@/app/lib/api-schema";
import { courierQueryKeys } from "@/src/entities/courier";
import {
  orderQueryKeys,
  type Order,
  type OrderStatus,
} from "@/src/entities/order";
import { useSession } from "@/src/shared/auth";

type TransitionBody = components["schemas"]["TransitionOrderDto"];
type AssignBody = components["schemas"]["AssignCourierDto"];
type CancelBody = components["schemas"]["CancelOrderDto"];

export function useOrderActions() {
  const queryClient = useQueryClient();
  const { authorizedRequest } = useSession();
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: orderQueryKeys.all }),
      queryClient.invalidateQueries({ queryKey: courierQueryKeys.all }),
    ]);
  };

  const transition = useMutation({
    mutationFn: ({
      orderId,
      status,
      version,
    }: {
      orderId: string;
      status: OrderStatus;
      version: number;
    }) =>
      authorizedRequest<Order>(`/orders/${orderId}/transition`, {
        method: "PATCH",
        body: JSON.stringify({
          status,
          version,
        } satisfies TransitionBody),
      }),
    onSuccess: refresh,
  });

  const assignCourier = useMutation({
    mutationFn: ({
      orderId,
      courierId,
      version,
    }: {
      orderId: string;
      courierId: string;
      version: number;
    }) =>
      authorizedRequest<Order>(`/orders/${orderId}/assign-courier`, {
        method: "PATCH",
        body: JSON.stringify({ courierId, version } satisfies AssignBody),
      }),
    onSuccess: refresh,
  });

  const cancel = useMutation({
    mutationFn: ({
      orderId,
      reason,
      version,
    }: {
      orderId: string;
      reason: string;
      version: number;
    }) =>
      authorizedRequest<Order>(`/orders/${orderId}/cancel`, {
        method: "PATCH",
        body: JSON.stringify({ reason, version } satisfies CancelBody),
      }),
    onSuccess: refresh,
  });

  return { transition, assignCourier, cancel };
}
