import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/src/shared/auth";
import type {
  Category,
  Product,
  ReceiptPrinter,
  ReceiptPrintSettings,
} from "../model/types";

export const catalogQueryKeys = {
  all: ["catalog"] as const,
  categories: (userId: string) =>
    [...catalogQueryKeys.all, "categories", userId] as const,
  products: (userId: string) =>
    [...catalogQueryKeys.all, "products", userId] as const,
  receiptPrintSettings: (userId: string) =>
    [...catalogQueryKeys.all, "receipt-print-settings", userId] as const,
  receiptPrinters: (userId: string) =>
    [...catalogQueryKeys.all, "receipt-printers", userId] as const,
};

export function useAdminCategories() {
  const { session, authorizedRequest } = useSession();
  return useQuery({
    queryKey: catalogQueryKeys.categories(session?.user.id ?? "anonymous"),
    queryFn: ({ signal }) =>
      authorizedRequest<Category[]>("/catalog/admin/categories", { signal }),
    enabled: Boolean(session),
    staleTime: 30_000,
  });
}

export function useReceiptPrintSettings() {
  const { session, authorizedRequest } = useSession();
  return useQuery({
    queryKey: catalogQueryKeys.receiptPrintSettings(
      session?.user.id ?? "anonymous",
    ),
    queryFn: ({ signal }) =>
      authorizedRequest<ReceiptPrintSettings>(
        "/catalog/admin/receipt-print-settings",
        { signal },
      ),
    enabled: Boolean(session),
    staleTime: 30_000,
  });
}

export function useReceiptPrinters() {
  const { session, authorizedRequest } = useSession();
  return useQuery({
    queryKey: catalogQueryKeys.receiptPrinters(session?.user.id ?? "anonymous"),
    queryFn: ({ signal }) =>
      authorizedRequest<ReceiptPrinter[]>("/catalog/admin/receipt-printers", {
        signal,
      }),
    enabled: Boolean(session),
    staleTime: 30_000,
  });
}

export function useAdminProducts() {
  const { session, authorizedRequest } = useSession();
  return useQuery({
    queryKey: catalogQueryKeys.products(session?.user.id ?? "anonymous"),
    queryFn: ({ signal }) =>
      authorizedRequest<Product[]>("/catalog/admin/products", { signal }),
    enabled: Boolean(session),
    staleTime: 20_000,
  });
}
