import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/src/shared/api/api-client";
import { useSession } from "@/src/shared/auth";
import type { DeliveryConfig } from "../model/types";

export const deliveryQueryKeys = {
  all: ["delivery"] as const,
  publicConfig: () => [...deliveryQueryKeys.all, "public-config"] as const,
  adminConfig: (userId: string) =>
    [...deliveryQueryKeys.all, "admin-config", userId] as const,
};

export function useDeliveryConfig() {
  return useQuery({
    queryKey: deliveryQueryKeys.publicConfig(),
    queryFn: ({ signal }) =>
      apiRequest<DeliveryConfig>("/delivery/config", { signal }),
    staleTime: 5 * 60_000,
  });
}

export function useAdminDeliveryConfig() {
  const { session, authorizedRequest } = useSession();
  const canView = Boolean(
    session && ["ADMIN", "SUPER_ADMIN"].includes(session.user.role),
  );
  return useQuery({
    queryKey: deliveryQueryKeys.adminConfig(session?.user.id ?? "anonymous"),
    queryFn: ({ signal }) =>
      authorizedRequest<DeliveryConfig>("/delivery/admin/config", { signal }),
    enabled: canView,
    staleTime: 30_000,
  });
}
