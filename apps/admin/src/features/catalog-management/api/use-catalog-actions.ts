import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  catalogQueryKeys,
  type Category,
  type CreateCategory,
  type CreateProduct,
  type MediaUpload,
  type Product,
  type ReceiptPrintSettings,
  type UpdateCategory,
  type UpdateProduct,
  type UpdateReceiptPrintSettings,
} from "@/src/entities/catalog";
import { useSession } from "@/src/shared/auth";

export function useCatalogActions() {
  const { authorizedRequest } = useSession();
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: catalogQueryKeys.all });
  const uploadImageFile = (file: File) => {
    const body = new FormData();
    body.append("file", file);
    return authorizedRequest<MediaUpload>("/media/images", {
      method: "POST",
      body,
    });
  };

  const uploadImage = useMutation({
    mutationFn: uploadImageFile,
  });
  const uploadImages = useMutation({
    mutationFn: (files: File[]) =>
      Promise.all(files.map((file) => uploadImageFile(file))),
  });
  const createCategory = useMutation({
    mutationFn: (body: CreateCategory) =>
      authorizedRequest<Category>("/catalog/categories", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: refresh,
  });
  const updateCategory = useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateCategory }) =>
      authorizedRequest<Category>(`/catalog/categories/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: refresh,
  });
  const updateReceiptPrintSettings = useMutation({
    mutationFn: (body: UpdateReceiptPrintSettings) =>
      authorizedRequest<ReceiptPrintSettings>(
        "/catalog/receipt-print-settings",
        {
          method: "PATCH",
          body: JSON.stringify(body),
        },
      ),
    onSuccess: refresh,
  });
  const createProduct = useMutation({
    mutationFn: (body: CreateProduct) =>
      authorizedRequest<Product>("/catalog/products", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: refresh,
  });
  const updateProduct = useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateProduct }) =>
      authorizedRequest<Product>(`/catalog/products/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: refresh,
  });
  return {
    uploadImage,
    uploadImages,
    createCategory,
    updateCategory,
    updateReceiptPrintSettings,
    createProduct,
    updateProduct,
  };
}
