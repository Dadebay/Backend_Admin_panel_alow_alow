import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/src/shared/auth";
import type { LoginAttemptPlatform, LoginAttemptStatus, LoginAttemptsResponse } from "../model/types";

export type LoginAttemptFilters = {
  phone?: string;
  status?: LoginAttemptStatus;
  platform?: LoginAttemptPlatform;
  from?: string;
  to?: string;
  page: number;
  limit: number;
};

export const loginAttemptQueryKeys = {
  all: ["login-attempts"] as const,
  list: (userId: string, filters: LoginAttemptFilters) =>
    [...loginAttemptQueryKeys.all, userId, filters] as const,
};

export function useLoginAttempts(filters: LoginAttemptFilters) {
  const { session, authorizedRequest } = useSession();
  const canView = Boolean(session && ["ADMIN", "SUPER_ADMIN"].includes(session.user.role));
  return useQuery({
    queryKey: loginAttemptQueryKeys.list(session?.user.id ?? "anonymous", filters),
    queryFn: ({ signal }) => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== "") params.set(key, String(value));
      }
      return authorizedRequest<LoginAttemptsResponse>(`/staff/login-attempts?${params}`, { signal });
    },
    enabled: canView,
    staleTime: 15_000,
  });
}
