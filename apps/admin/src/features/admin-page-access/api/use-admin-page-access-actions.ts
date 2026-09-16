import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  adminPageAccessQueryKeys,
  type AdminUserPageAccess,
  type UpdateAdminPageAccess,
} from "@/src/entities/admin-page-access";
import { useSession } from "@/src/shared/auth";

export function useAdminPageAccessActions() {
  const { authorizedRequest } = useSession();
  const queryClient = useQueryClient();

  const updateUserAccess = useMutation({
    mutationFn: ({
      userId,
      body,
    }: {
      userId: string;
      body: UpdateAdminPageAccess;
    }) =>
      authorizedRequest<AdminUserPageAccess>(`/admin-page-access/${userId}`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: adminPageAccessQueryKeys.all,
      });
    },
  });

  return { updateUserAccess };
}
