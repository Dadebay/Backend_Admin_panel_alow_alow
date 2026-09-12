import { z } from "zod";

const moneyInput = z
  .string()
  .trim()
  .min(1, "Укажите сумму")
  .refine(
    (value) => /^\d+(?:[.,]\d{1,2})?$/.test(value),
    "Укажите сумму с точностью до 2 знаков",
  )
  .transform((value) => Number(value.replace(",", ".")))
  .refine((value) => value <= 1_000_000, "Сумма слишком большая");

const optionalMoneyInput = z
  .string()
  .trim()
  .refine(
    (value) => !value || /^\d+(?:[.,]\d{1,2})?$/.test(value),
    "Укажите сумму с точностью до 2 знаков",
  )
  .transform((value) => (value ? Number(value.replace(",", ".")) : null))
  .refine(
    (value) => value === null || value <= 1_000_000,
    "Сумма слишком большая",
  );

const requiredName = (maxLength: number) =>
  z
    .string()
    .trim()
    .min(1, "Укажите название")
    .max(maxLength, `Не более ${maxLength} символов`);

const optionalName = (maxLength: number) =>
  z
    .string()
    .trim()
    .max(maxLength, `Не более ${maxLength} символов`)
    .transform((value) => value || null);

const integerInput = z
  .string()
  .trim()
  .regex(/^\d+$/, "Укажите целое число")
  .transform(Number);

const optionalIntegerInput = z
  .string()
  .trim()
  .refine((value) => !value || /^\d+$/.test(value), "Укажите целое число")
  .transform((value) => (value ? Number(value) : null));

export const deliverySettingsFormSchema = z.object({
  fallbackPrice: moneyInput,
  fallbackNightPrice: moneyInput.optional(),
  fallbackNightFreeDeliveryThreshold: optionalMoneyInput.optional(),
  fallbackFreeDeliveryThreshold: optionalMoneyInput,
});

export const deliveryEtrapFormSchema = z.object({
  welayatId: integerInput,
  nameEn: optionalName(240),
  nameRu: requiredName(240),
  nameTk: requiredName(240),
  queuePosition: optionalIntegerInput,
  price: moneyInput,
  nightPrice: moneyInput.optional(),
  nightFreeDeliveryThreshold: optionalMoneyInput.optional(),
  freeDeliveryThreshold: optionalMoneyInput,
  isDeliveryEnabled: z.boolean(),
});

export const deliveryWelayatFormSchema = z.object({
  nameEn: optionalName(160),
  nameRu: requiredName(160),
  nameTk: requiredName(160),
  sortOrder: integerInput,
});

export type DeliverySettingsFormInput = z.input<
  typeof deliverySettingsFormSchema
>;
export type DeliverySettingsFormValues = z.output<
  typeof deliverySettingsFormSchema
>;
export type DeliveryEtrapFormInput = z.input<typeof deliveryEtrapFormSchema>;
export type DeliveryEtrapFormValues = z.output<typeof deliveryEtrapFormSchema>;
export type DeliveryWelayatFormInput = z.input<
  typeof deliveryWelayatFormSchema
>;
export type DeliveryWelayatFormValues = z.output<
  typeof deliveryWelayatFormSchema
>;

const clockInput = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Укажите время в формате ЧЧ:ММ");
export const deliveryNightScheduleSchema = z
  .object({
    version: z.number().int().min(1),
    nightTariffEnabled: z.boolean(),
    nightStartsAt: clockInput,
    nightEndsAt: clockInput,
  })
  .refine((value) => value.nightStartsAt !== value.nightEndsAt, {
    path: ["nightEndsAt"],
    message: "Начало и конец ночного тарифа должны различаться",
  });
export type DeliveryNightScheduleValues = z.infer<
  typeof deliveryNightScheduleSchema
>;
