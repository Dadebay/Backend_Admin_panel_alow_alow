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

const productVariantSchema = z.object({
  id: z.uuid().optional(),
  name: z
    .string()
    .trim()
    .min(1, "Укажите название варианта")
    .max(120, "Не больше 120 символов"),
  description: z.string().trim().max(300, "Не больше 300 символов"),
  price: z
    .number({ error: "Укажите цену варианта" })
    .min(0, "Цена не может быть отрицательной")
    .multipleOf(0.01, "Не больше двух знаков после запятой"),
  sortOrder: z.number({ error: "Укажите порядок" }).int("Введите целое число"),
  isActive: z.boolean(),
  imageUrls: z.array(z.string()).max(10),
  imageFiles: z.unknown().optional(),
});

const receiptPrinterIpSchema = z
  .string()
  .trim()
  .refine(
    (value) => value === "" || z.ipv4().safeParse(value).success,
    "Введите IPv4 адрес, например 192.168.1.50",
  );

export const productFormSchema = z
  .object({
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
    receiptPrinterIp: receiptPrinterIpSchema,
    variantLabel: z.string().trim().max(80, "Не больше 80 символов"),
    variants: z.array(productVariantSchema).max(30, "Не больше 30 вариантов"),
    sortOrder: z
      .number({ error: "Укажите порядок" })
      .int("Введите целое число"),
    isActive: z.boolean(),
  })
  .superRefine((values, context) => {
    if (values.variants.length && !values.variantLabel) {
      context.addIssue({
        code: "custom",
        path: ["variantLabel"],
        message: "Укажите название выбора: например, Размер",
      });
    }
    const names = values.variants.map(({ name }) =>
      name.trim().toLocaleLowerCase("ru-RU"),
    );
    if (new Set(names).size !== names.length) {
      context.addIssue({
        code: "custom",
        path: ["variants"],
        message: "Названия вариантов не должны повторяться",
      });
    }
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
