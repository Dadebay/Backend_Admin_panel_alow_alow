import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { components } from "@alowalow/api-contract";
import { orderQueryKeys, type Order } from "@/src/entities/order";
import { useSession } from "@/src/shared/auth";

export type CreateAssistedOrderBody =
  components["schemas"]["CreateAssistedOrderDto"];

export function useAssistedOrderActions() {
  const queryClient = useQueryClient();
  const { authorizedRequest } = useSession();

  const create = useMutation({
    mutationFn: (body: CreateAssistedOrderBody) =>
      authorizedRequest<Order>("/orders/assisted", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: orderQueryKeys.all }),
  });

  return { create };
}
