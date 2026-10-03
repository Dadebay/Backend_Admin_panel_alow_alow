import { useQuery } from "@tanstack/react-query";
import type { Order, OrderList } from "@/src/entities/order";
import { useSession } from "@/src/shared/auth";

export function useAssistedOrderHistory(customerId: string | null, phone: string) {
  const { session, authorizedRequest } = useSession();
  return useQuery({
    queryKey: ["assisted-order-history", session?.user.id, customerId],
    queryFn: async ({ signal }): Promise<Order[]> => {
      const query = new URLSearchParams({
        search: phone,
        page: "1",
        limit: "100",
      });
      const result = await authorizedRequest<OrderList>(`/orders?${query}`, {
        signal,
      });
      return result.items.filter((order) => order.customerId === customerId);
    },
    enabled: Boolean(session && customerId && phone),
    staleTime: 30_000,
  });
}
