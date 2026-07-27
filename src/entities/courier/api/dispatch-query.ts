"use client";

import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/src/shared/api/api-client";
import { useSession } from "@/src/shared/auth";
import type { DispatchSnapshot } from "../model/types";

export const courierQueryKeys = {
  all: ["couriers"] as const,
  dispatch: (userId: string) =>
    [...courierQueryKeys.all, "dispatch", userId] as const,
};

export function useDispatchSnapshot() {
  const { session } = useSession();
  const userId = session?.user.id ?? "anonymous";
  const canViewDispatch = Boolean(
    session &&
      ["OPERATOR", "ADMIN", "SUPER_ADMIN"].includes(session.user.role),
  );
  return useQuery({
    queryKey: courierQueryKeys.dispatch(userId),
    queryFn: ({ signal }) =>
      apiRequest<DispatchSnapshot>("/tracking/dispatch", {
        accessToken: session?.accessToken,
        signal,
      }),
    enabled: canViewDispatch,
    staleTime: 20_000,
    gcTime: 2 * 60_000,
    refetchInterval: () =>
      typeof document !== "undefined" &&
      document.visibilityState === "visible"
        ? 30_000
        : false,
    refetchIntervalInBackground: false,
    retry: 1,
  });
}
