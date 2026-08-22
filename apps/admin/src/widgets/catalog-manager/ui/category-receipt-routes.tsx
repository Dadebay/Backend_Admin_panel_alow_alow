import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type { Category } from "@/src/entities/catalog";
import { FormFieldError } from "@/src/shared/forms";
import {
  categoryReceiptRouteFormSchema,
  type CategoryReceiptRouteFormValues,
} from "../model/catalog-forms";

function CategoryReceiptRouteRow({
  category,
  canEdit,
  isPending,
  onSave,
  onToggleActive,
}: {
  category: Category;
  canEdit: boolean;
  isPending: boolean;
  onSave: (
    category: Category,
    values: CategoryReceiptRouteFormValues,
  ) => Promise<void>;
  onToggleActive: (category: Category) => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<CategoryReceiptRouteFormValues>({
    resolver: zodResolver(categoryReceiptRouteFormSchema),
    mode: "onBlur",
    values: {
      receiptPrinterIp: category.receiptPrinterIp ?? "",
    },
  });

  return (
    <form
      className="category-printer-route-row"
      data-testid={`category-printer-route-${category.id}`}
      noValidate
      onSubmit={handleSubmit((values) => onSave(category, values))}
    >
      <div className="category-printer-route-name">
        <strong>{category.name}</strong>
        <small>
          {category.products.length} блюд ·{" "}
          <span
            className={
              category.isActive
                ? "category-visibility-state active"
                : "category-visibility-state hidden"
            }
          >
            {category.isActive ? "видна клиентам" : "скрыта от клиентов"}
          </span>
        </small>
      </div>
      <label>
        <span className="visually-hidden">
          IP кухонного X-принтера для категории {category.name}
        </span>
        <input
          data-testid={`category-printer-ip-${category.id}`}
          {...register("receiptPrinterIp")}
          aria-invalid={Boolean(errors.receiptPrinterIp)}
          aria-label={`IP кухонного X-принтера для категории ${category.name}`}
          disabled={!canEdit || isPending}
          inputMode="decimal"
          placeholder="192.168.1.51"
        />
        <FormFieldError message={errors.receiptPrinterIp?.message} />
      </label>
      {canEdit ? (
        <div className="category-printer-route-actions">
          <button
            className="secondary-button compact"
            data-testid={`category-printer-save-${category.id}`}
            disabled={!isDirty || isPending}
          >
            {isPending ? "Сохраняем…" : "Сохранить IP"}
          </button>
          <button
            className="text-button compact"
            data-testid={`category-visibility-${category.id}`}
            disabled={isPending}
            type="button"
            onClick={() => onToggleActive(category)}
          >
            {category.isActive ? "Скрыть категорию" : "Показать категорию"}
          </button>
        </div>
      ) : (
        <span className="category-printer-route-readonly">
          Только администратор
        </span>
      )}
    </form>
  );
}

export function CategoryReceiptRoutes({
  categories,
  canEdit,
  isPending,
  isLoading,
  onRetry,
  onSave,
  onToggleActive,
}: {
  categories: Category[];
  canEdit: boolean;
  isPending: boolean;
  isLoading: boolean;
  onRetry: () => void;
  onSave: (
    category: Category,
    values: CategoryReceiptRouteFormValues,
  ) => Promise<void>;
  onToggleActive: (category: Category) => void;
}) {
  return (
    <section
      className="table-card category-printer-routes"
      data-testid="category-printer-routes"
      aria-labelledby="category-printer-routes-title"
    >
      <header>
        <div>
          <span className="eyebrow">КУХОННЫЕ КОПИИ</span>
          <h2 id="category-printer-routes-title">Категории и X-принтеры</h2>
        </div>
        <p>
          Здесь можно сразу скрыть всю категорию или назначить ей стандартный
          принтер. Блюдо с собственным IP печатается только на своём аппарате и
          не дублируется на принтер категории.
        </p>
      </header>

      {isLoading ? (
        <div className="category-printer-routes-state">
          Загружаем категории…
        </div>
      ) : categories.length ? (
        <div className="category-printer-route-list">
          {categories.map((category) => (
            <CategoryReceiptRouteRow
              key={category.id}
              category={category}
              canEdit={canEdit}
              isPending={isPending}
              onSave={onSave}
              onToggleActive={onToggleActive}
            />
          ))}
        </div>
      ) : (
        <div className="category-printer-routes-state">
          <span>Категории не загрузились или ещё не созданы.</span>
          <button className="text-button compact" type="button" onClick={onRetry}>
            Повторить
          </button>
        </div>
      )}

      <small className="category-printer-routes-note">
        Допустимы только адреса локальной сети: 10.x.x.x, 172.16–31.x.x или
        192.168.x.x. Пустое поле отключает категорийный маршрут для блюд без
        собственного IP.
      </small>
    </section>
  );
}
