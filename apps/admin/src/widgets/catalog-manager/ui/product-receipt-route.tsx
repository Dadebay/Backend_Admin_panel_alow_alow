import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type { Product } from "@/src/entities/catalog";
import { FormFieldError } from "@/src/shared/forms";
import {
  categoryReceiptRouteFormSchema,
  type CategoryReceiptRouteFormValues,
} from "../model/catalog-forms";

export function ProductReceiptRoute({
  product,
  canEdit,
  isPending,
  onSave,
}: {
  product: Product;
  canEdit: boolean;
  isPending: boolean;
  onSave: (product: Product, receiptPrinterIp: string) => Promise<void>;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<CategoryReceiptRouteFormValues>({
    resolver: zodResolver(categoryReceiptRouteFormSchema),
    mode: "onBlur",
    values: { receiptPrinterIp: product.receiptPrinterIp ?? "" },
  });

  if (!canEdit) {
    return (
      <div className="primary-cell">
        <strong>{product.effectiveReceiptPrinterIp ?? "Не назначен"}</strong>
        <small>
          {product.receiptPrinterIp
            ? "Свой IP · приоритет над категорией"
            : product.effectiveReceiptPrinterIp
              ? "Наследуется от категории"
              : "Маршрут не назначен"}
        </small>
      </div>
    );
  }

  return (
    <form
      className="product-printer-route"
      data-testid={`product-printer-route-${product.id}`}
      noValidate
      onSubmit={handleSubmit((values) =>
        onSave(product, values.receiptPrinterIp),
      )}
    >
      <label>
        <span className="visually-hidden">
          Свой IP чекового аппарата для блюда {product.name}
        </span>
        <input
          data-testid={`product-printer-ip-${product.id}`}
          {...register("receiptPrinterIp")}
          aria-invalid={Boolean(errors.receiptPrinterIp)}
          disabled={isPending}
          inputMode="decimal"
          placeholder={product.effectiveReceiptPrinterIp ?? "192.168.1.52"}
        />
        <FormFieldError message={errors.receiptPrinterIp?.message} />
      </label>
      <small>
        {product.receiptPrinterIp
          ? "Свой IP: категория не используется"
          : product.effectiveReceiptPrinterIp
            ? `Сейчас от категории: ${product.effectiveReceiptPrinterIp}`
            : "Сейчас принтер не назначен"}
      </small>
      <div className="product-printer-route-actions">
        <button
          className="secondary-button compact"
          data-testid={`product-printer-save-${product.id}`}
          disabled={!isDirty || isPending}
        >
          Сохранить IP
        </button>
        <button
          className="text-button compact"
          data-testid={`product-printer-clear-${product.id}`}
          disabled={!product.receiptPrinterIp || isPending}
          type="button"
          onClick={() => void onSave(product, "")}
        >
          Убрать свой IP
        </button>
      </div>
    </form>
  );
}
