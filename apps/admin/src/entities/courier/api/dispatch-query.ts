import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/src/shared/auth";
import type { CourierRoute, DispatchSnapshot } from "../model/types";

export const courierQueryKeys = {
  all: ["couriers"] as const,
  dispatch: (userId: string) =>
    [...courierQueryKeys.all, "dispatch", userId] as const,
  route: (userId: string, courierId: string) =>
    [...courierQueryKeys.all, "route", userId, courierId] as const,
  routeOverview: (userId: string, courierIds: string[] = []) =>
    [
      ...courierQueryKeys.all,
      "route-overview",
      userId,
      ...courierIds,
    ] as const,
};

export function useDispatchSnapshot() {
  const { session, authorizedRequest } = useSession();
  const userId = session?.user.id ?? "anonymous";
  const canViewDispatch = Boolean(
    session &&
      ["OPERATOR", "ADMIN", "SUPER_ADMIN"].includes(session.user.role),
  );
  return useQuery({
    queryKey: courierQueryKeys.dispatch(userId),
    queryFn: ({ signal }) =>
      authorizedRequest<DispatchSnapshot>("/tracking/dispatch", {
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

export function useCourierRoute(courierId: string | null) {
  const { session, authorizedRequest } = useSession();
  const userId = session?.user.id ?? "anonymous";
  const canViewDispatch = Boolean(
    session &&
      ["OPERATOR", "ADMIN", "SUPER_ADMIN"].includes(session.user.role),
  );
  return useQuery({
    queryKey: courierQueryKeys.route(userId, courierId ?? "unselected"),
    queryFn: ({ signal }) =>
      authorizedRequest<CourierRoute>(
        `/orders/couriers/${courierId}/route`,
        { signal },
      ),
    enabled: canViewDispatch && Boolean(courierId),
    staleTime: 10_000,
    gcTime: 2 * 60_000,
    retry: 1,
  });
}

export function useCourierRoutes(courierIds: string[]) {
  const { session, authorizedRequest } = useSession();
  const userId = session?.user.id ?? "anonymous";
  const canViewDispatch = Boolean(
    session &&
      ["OPERATOR", "ADMIN", "SUPER_ADMIN"].includes(session.user.role),
  );

  return useQuery({
    queryKey: courierQueryKeys.routeOverview(userId, courierIds),
    queryFn: async ({ signal }) => {
      const routes: Array<{
        courierId: string;
        route: CourierRoute | null;
      }> = [];
      // Local OSRM is intentionally bounded. Sequential planning keeps an
      // all-courier refresh from timing out every route under a large burst.
      for (const courierId of courierIds) {
        try {
          routes.push({
            courierId,
            route: await authorizedRequest<CourierRoute>(
              `/orders/couriers/${courierId}/route`,
              { signal },
            ),
          });
        } catch (error) {
          if (signal.aborted) throw error;
          routes.push({ courierId, route: null });
        }
      }
      return routes;
    },
    enabled: canViewDispatch && courierIds.length > 0,
    staleTime: 10_000,
    gcTime: 2 * 60_000,
    retry: 1,
  });
}
