import { z } from "zod";
import { turkmenPhoneSchema } from "../../../shared/forms/schema.ts";

export const otpRequestSchema = z.object({
  phone: turkmenPhoneSchema,
  code: z.string(),
});

export const otpVerifySchema = otpRequestSchema.extend({
  code: z.string().regex(/^\d{6}$/, "Введите 6 цифр из SMS"),
});

export type OtpLoginFormValues = z.infer<typeof otpRequestSchema>;
