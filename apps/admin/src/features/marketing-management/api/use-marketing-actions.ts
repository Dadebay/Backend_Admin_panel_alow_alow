"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  marketingQueryKeys,
  type Banner,
  type CreateBanner,
  type CreatePromo,
  type Promo,
  type UpdateBanner,
  type UpdatePromo,
} from "@/src/entities/marketing";
import { useSession } from "@/src/shared/auth";

export function useMarketingActions() {
  const { authorizedRequest } = useSession();
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: marketingQueryKeys.all });
  const createBanner = useMutation({
    mutationFn: (body: CreateBanner) =>
      authorizedRequest<Banner>("/marketing/banners", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: refresh,
  });
  const updateBanner = useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateBanner }) =>
      authorizedRequest<Banner>(`/marketing/banners/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: refresh,
  });
  const createPromo = useMutation({
    mutationFn: (body: CreatePromo) =>
      authorizedRequest<Promo>("/marketing/promos", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: refresh,
  });
  const updatePromo = useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdatePromo }) =>
      authorizedRequest<Promo>(`/marketing/promos/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: refresh,
  });
  return { createBanner, updateBanner, createPromo, updatePromo };
}
