import { z } from "zod";

const optionalIntegerString = z
  .string()
  .trim()
  .max(12, "Выберите район доставки из списка")
  .transform((value) => value || "")
  .refine(
    (value) => value === "" || /^[1-9]\d*$/.test(value),
    "Выберите район доставки из списка",
  );

const promoCodeSchema = z
  .string()
  .trim()
  .max(40, "Промокод: не больше 40 символов")
  .transform((value: string) => value.toUpperCase() || "");

const budgetSchema = z
  .string()
  .trim()
  .max(12, "Слишком большой формат бюджета")
  .transform((value: string) => value || "")
  .refine((value) => {
    if (!value) return true;
    return /^\d+(?:[.,]\d{1,2})?$/.test(value);
  }, "Введите бюджет в формате 0.00");

export const mealCalculatorFormSchema = z.object({
  deliveryEtrapId: optionalIntegerString,
  promoCode: promoCodeSchema,
  budget: budgetSchema,
});

export type MealCalculatorFormInput = z.input<typeof mealCalculatorFormSchema>;
export type MealCalculatorFormValues = z.output<typeof mealCalculatorFormSchema>;
