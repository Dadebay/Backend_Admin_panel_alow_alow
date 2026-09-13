import { useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  formatInventoryQuantity,
  inventoryMovementLabels,
  type StockItem,
} from "@/src/entities/inventory";
import {
  stockAdjustmentFormSchema,
  stockDelta,
  useInventoryActions,
  type StockAdjustmentFormInput,
  type StockAdjustmentFormValues,
} from "@/src/features/inventory-management";
import { FormFieldError } from "@/src/shared/forms";

export function StockAdjustment({
  item,
  onClose,
  onSaved,
}: {
  item: StockItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { adjustStock } = useInventoryActions();
  const attempt = useRef<{ signature: string; key: string } | null>(null);
  const form = useForm<
    StockAdjustmentFormInput,
    unknown,
    StockAdjustmentFormValues
  >({
    resolver: zodResolver(stockAdjustmentFormSchema),
    defaultValues: { amount: "", type: "RECEIPT", reason: "" },
  });
  const errors = form.formState.errors;
  async function submit(values: StockAdjustmentFormValues) {
    const payload = {
      branchId: item.branchId,
      quantityDelta: stockDelta(values),
      type: values.type,
      reason: values.reason,
    };
    const signature = JSON.stringify({
      ingredientId: item.ingredientId,
      ...payload,
    });
    if (attempt.current?.signature !== signature) {
      attempt.current = { signature, key: crypto.randomUUID() };
    }
    try {
      await adjustStock.mutateAsync({
        ingredientId: item.ingredientId,
        payload: {
          ...payload,
          idempotencyKey: attempt.current.key,
        },
      });
      onSaved();
    } catch {
      /* Mutation feedback stays in the form, retaining the entered data. */
    }
  }
  return (
    <form
      className="inventory-adjustment form-stack"
      data-testid="inventory-adjustment-form"
      onSubmit={(event) => void form.handleSubmit(submit)(event)}
      noValidate
    >
      <strong>
        {item.ingredientName} · {item.branchName}
      </strong>
      <p className="muted-text">
        Сейчас: {formatInventoryQuantity(item.quantity, item.unit)}. Для расхода
        и потерь вводите положительное число; корректировка принимает знак + или
        −.
      </p>
      <div className="form-grid">
        <label>
          <span>Операция</span>
          <select
            data-testid="inventory-adjustment-type"
            {...form.register("type")}
          >
            {Object.entries(inventoryMovementLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>
            Количество (
            {formatInventoryQuantity(1, item.unit).replace(/^1\s/, "")})
          </span>
          <input
            autoFocus
            inputMode="decimal"
            data-testid="inventory-adjustment-amount"
            {...form.register("amount")}
            aria-invalid={Boolean(errors.amount)}
          />
          <FormFieldError message={errors.amount?.message} />
        </label>
        <label className="wide-field">
          <span>Причина</span>
          <input
            data-testid="inventory-adjustment-reason"
            {...form.register("reason")}
            placeholder="Номер поставки, приготовление, потери…"
            aria-invalid={Boolean(errors.reason)}
          />
          <FormFieldError message={errors.reason?.message} />
        </label>
      </div>
      {adjustStock.error && (
        <p className="error-text" role="alert">
          {adjustStock.error.message}
        </p>
      )}
      <div className="toolbar">
        <button
          className="primary-button"
          type="submit"
          data-testid="inventory-adjustment-save"
          disabled={adjustStock.isPending}
        >
          {adjustStock.isPending ? "Сохраняем…" : "Сохранить операцию"}
        </button>
        <button
          className="secondary-button"
          type="button"
          data-testid="inventory-adjustment-cancel"
          onClick={onClose}
          disabled={adjustStock.isPending}
        >
          Закрыть
        </button>
      </div>
    </form>
  );
}
