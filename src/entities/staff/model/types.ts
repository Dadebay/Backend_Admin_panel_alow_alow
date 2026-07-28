import type { components } from "@/app/lib/api-schema";

export type Staff = components["schemas"]["StaffResponseDto"];
export type StaffMutation =
  components["schemas"]["StaffMutationResponseDto"];
export type CreateStaff = components["schemas"]["CreateStaffDto"];
export type UpdateStaff = components["schemas"]["UpdateStaffDto"];
