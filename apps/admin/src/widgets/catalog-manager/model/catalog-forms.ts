import { z } from "zod";
import { slugSchema } from "../../../shared/forms/schema.ts";

export const categoryFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Укажите название категории")
    .max(100, "Не больше 100 символов"),
  slug: slugSchema.max(120, "Не больше 120 символов"),
  sortOrder: z.number({ error: "Укажите порядок" }).int("Введите целое число"),
  isActive: z.boolean(),
  image: z.unknown().optional(),
});

export const productFormSchema = z.object({
  categoryId: z.uuid("Выберите категорию"),
  name: z
    .string()
    .trim()
    .min(1, "Укажите название блюда")
    .max(160, "Не больше 160 символов"),
  slug: slugSchema.max(180, "Не больше 180 символов"),
  description: z
    .string()
    .trim()
    .min(1, "Добавьте описание")
    .max(4000, "Не больше 4000 символов"),
  price: z
    .number({ error: "Укажите цену" })
    .min(0, "Цена не может быть отрицательной")
    .multipleOf(0.01, "Не больше двух знаков после запятой"),
  sortOrder: z.number({ error: "Укажите порядок" }).int("Введите целое число"),
  isActive: z.boolean(),
});

export type CategoryFormValues = z.infer<typeof categoryFormSchema>;
export type ProductFormValues = z.infer<typeof productFormSchema>;

export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9а-яё]+/gi, "-")
    .replace(/^-|-$/g, "");
}
