import { z } from "zod";

export const manualReceiptFormSchema = z.object({
  routes: z
    .array(z.object({
      itemId: z.uuid(),
      destination: z.union([
        z.literal("DEFAULT"),
        z.literal("MAIN"),
        z.literal("SKIP"),
        z.uuid(),
      ]),
    }))
    .min(1)
    .max(100)
    .refine((routes) => routes.some((route) => route.destination !== "SKIP"), {
      message: "Выберите хотя бы одно блюдо для печати",
    }),
});

export type ManualReceiptFormValues = z.infer<typeof manualReceiptFormSchema>;

export function manualReceiptItemRoutes(values: ManualReceiptFormValues) {
  return values.routes.flatMap((route) => {
    if (route.destination === "DEFAULT") return [];
    if (route.destination === "SKIP")
      return [{ itemId: route.itemId, printerId: null, skip: true }];
    return [{
      itemId: route.itemId,
      printerId: route.destination === "MAIN" ? null : route.destination,
    }];
  });
}
