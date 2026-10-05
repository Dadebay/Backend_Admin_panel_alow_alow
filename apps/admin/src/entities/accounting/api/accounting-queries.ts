import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/src/shared/auth";
import type {
  AccountingReport,
  AccountingShift,
} from "../model/types";

export const accountingQueryKeys = {
  all: ["accounting"] as const,
  shifts: (userId: string, fromDate: string, toDate: string) =>
    [...accountingQueryKeys.all, "shifts", userId, fromDate, toDate] as const,
  report: (userId: string, fromDate: string, toDate: string) =>
    [...accountingQueryKeys.all, "report", userId, fromDate, toDate] as const,
};

export function useAccountingShifts(fromDate: string, toDate: string) {
  const { session, authorizedRequest } = useSession();
  const search = new URLSearchParams({ fromDate, toDate });
  return useQuery({
    queryKey: accountingQueryKeys.shifts(
      session?.user.id ?? "anonymous",
      fromDate,
      toDate,
    ),
    queryFn: ({ signal }) =>
      authorizedRequest<AccountingShift[]>(`/accounting/days?${search}`, {
        signal,
      }),
    enabled: Boolean(session),
    staleTime: 15_000,
    refetchInterval: 60_000,
  });
}

export function useAccountingReport(
  fromDate: string,
  toDate: string,
  hasExpandedAccess = false,
  enabled = true,
) {
  const { session, authorizedRequest } = useSession();
  const canView = Boolean(
    session &&
      (["ACCOUNTANT", "SUPER_ADMIN"].includes(session.user.role) ||
        hasExpandedAccess),
  );
  const search = new URLSearchParams({ fromDate, toDate });
  return useQuery({
    queryKey: accountingQueryKeys.report(
      session?.user.id ?? "anonymous",
      fromDate,
      toDate,
    ),
    queryFn: ({ signal }) =>
      authorizedRequest<AccountingReport>(`/accounting/report?${search}`, {
        signal,
      }),
    enabled: canView && enabled,
    staleTime: 30_000,
  });
}
