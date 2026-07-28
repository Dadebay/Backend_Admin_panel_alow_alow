"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  catalogQueryKeys,
  type Category,
  type CreateCategory,
  type CreateProduct,
  type MediaUpload,
  type Product,
  type UpdateCategory,
  type UpdateProduct,
} from "@/src/entities/catalog";
import { useSession } from "@/src/shared/auth";

export function useCatalogActions() {
  const { authorizedRequest } = useSession();
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: catalogQueryKeys.all });

  const uploadImage = useMutation({
    mutationFn: (file: File) => {
      const body = new FormData();
      body.append("file", file);
      return authorizedRequest<MediaUpload>("/media/images", {
        method: "POST",
        body,
      });
    },
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
    createCategory,
    updateCategory,
    createProduct,
    updateProduct,
  };
}
