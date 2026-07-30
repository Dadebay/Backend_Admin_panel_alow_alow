import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/src/shared/auth";
import type { Staff } from "../model/types";

export const staffQueryKeys = {
  all: ["staff"] as const,
  list: (userId: string) => [...staffQueryKeys.all, "list", userId] as const,
};

export function useStaff() {
  const { session, authorizedRequest } = useSession();
  return useQuery({
    queryKey: staffQueryKeys.list(session?.user.id ?? "anonymous"),
    queryFn: ({ signal }) =>
      authorizedRequest<Staff[]>("/staff", { signal }),
    enabled: Boolean(
      session &&
        ["OPERATOR", "ACCOUNTANT", "ADMIN", "SUPER_ADMIN"].includes(
          session.user.role,
        ),
    ),
    staleTime: 30_000,
  });
}
