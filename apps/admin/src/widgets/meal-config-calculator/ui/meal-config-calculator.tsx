import { useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import {
  filterOrderableProducts,
  groupProductsByCategory,
  useAdminProducts,
  type Product,
  type ProductCategoryGroup,
} from "@/src/entities/catalog";
import {
  useDeliveryConfig,
  flattenDeliveryEtraps,
  type DeliveryEtrapWithWelayat,
} from "@/src/entities/delivery";
import { ApiError } from "@/src/shared/api/api-client";
import { FormFieldError } from "@/src/shared/forms";
import {
  buildMealBudgetAdvice,
  formatMoney,
  mealCalculatorFormSchema,
  mealQuoteLineLabel,
  useMealConfigCalculatorQuote,
  type MealCalculatorFormInput,
  type MealCalculatorFormValues,
} from "@/src/features/meal-config-calculator";
import { InventoryDashboard } from "@/src/widgets/inventory-dashboard";
import { RecipeInventoryConfigurator } from "./recipe-inventory-configurator";
import "./meal-config-calculator.css";

type ProductSelectionKey = string;
type SelectionByKey = Record<ProductSelectionKey, number>;

type SelectedProductItem = {
  product: Product;
  variant: Product["variants"][number] | null;
  quantity: number;
  key: ProductSelectionKey;
};

function selectionKey(productId: string, variantId?: string) {
  return `${productId}:${variantId ?? "base"}`;
}

function activeVariants(product: Product) {
  return product.variants
    .filter(({ isActive }) => isActive)
    .sort(
      (left, right) =>
        left.sortOrder - right.sortOrder ||
        left.name.localeCompare(right.name) ||
        left.price - right.price,
    );
}

function parseMoney(value: string) {
  if (!value.trim()) return null;
  const normalized = value.trim().replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function MealConfigCalculator() {
  const productsQuery = useAdminProducts();
  const deliveryConfig = useDeliveryConfig();
  const quoteMutation = useMealConfigCalculatorQuote();
  const [productSearch, setProductSearch] = useState("");
  const [selectionByKey, setSelectionByKey] = useState<SelectionByKey>({});
  const [lastQuoteError, setLastQuoteError] = useState("");
  const [lastQuoteBudget, setLastQuoteBudget] = useState<number | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<MealCalculatorFormInput, unknown, MealCalculatorFormValues>({
    resolver: zodResolver(mealCalculatorFormSchema),
    mode: "onBlur",
    defaultValues: {
      deliveryEtrapId: "",
      promoCode: "",
      budget: "",
    },
  });

  const filteredProducts = useMemo(
    () =>
      filterOrderableProducts(productsQuery.data ?? [], {
        query: productSearch,
      }),
    [productSearch, productsQuery.data],
  );
  const groupedProducts = useMemo<ProductCategoryGroup<Product>[]>(
    () => groupProductsByCategory(filteredProducts),
    [filteredProducts],
  );
  const availableEtraps = useMemo<DeliveryEtrapWithWelayat[]>(
    () => flattenDeliveryEtraps(deliveryConfig.data),
    [deliveryConfig.data],
  );
  const selectedItems = useMemo<SelectedProductItem[]>(() => {
    const items: SelectedProductItem[] = [];
    for (const product of productsQuery.data ?? []) {
      if (product.pricingType === "FIXED") {
        const quantity = selectionByKey[selectionKey(product.id)] ?? 0;
        if (quantity > 0) {
          items.push({
            product,
            variant: null,
            quantity,
            key: selectionKey(product.id),
          });
        }
        continue;
      }

      const variants = activeVariants(product);
      for (const variant of variants) {
        const quantity =
          selectionByKey[selectionKey(product.id, variant.id)] ?? 0;
        if (quantity > 0) {
          items.push({
            product,
            variant,
            quantity,
            key: selectionKey(product.id, variant.id),
          });
        }
      }
    }
    return items;
  }, [productsQuery.data, selectionByKey]);

  const quote = quoteMutation.data;
  const budgetAdvice = useMemo(
    () => (quote && lastQuoteBudget !== null ? buildMealBudgetAdvice(quote, lastQuoteBudget) : null),
    [quote, lastQuoteBudget],
  );
  const canQuote = selectedItems.length > 0;

  function clearSelection() {
    setSelectionByKey({});
  }

  function changeQuantity(key: string, delta: number) {
    setSelectionByKey((current: SelectionByKey) => {
      const next = Math.max(
        0,
        Math.min(50, (current[key] ?? 0) + delta),
      );
      if (next === 0) {
        const nextSelectionByKey = { ...current };
        delete nextSelectionByKey[key];
        return nextSelectionByKey;
      }
      return { ...current, [key]: next };
    });
    setLastQuoteError("");
  }

  async function handleRun(values: MealCalculatorFormValues) {
    if (!canQuote) {
      setLastQuoteError("Добавьте хотя бы одно блюдо.");
      return;
    }

    const deliveryEtrapId = values.deliveryEtrapId
      ? Number.parseInt(values.deliveryEtrapId, 10)
      : undefined;
    const budget = parseMoney(values.budget);
    setLastQuoteBudget(budget ?? null);
    setLastQuoteError("");

    const body = {
      items: selectedItems.map((item) => ({
        productId: item.product.id,
        variantId: item.variant?.id,
        quantity: item.quantity,
      })),
      deliveryEtrapId,
      promoCode: values.promoCode,
    };

    try {
      await quoteMutation.mutateAsync(body);
    } catch (reason) {
      setLastQuoteError(
        reason instanceof ApiError
          ? reason.message
          : "Не удалось просчитать конфигурацию",
      );
    }
  }

  function setPresetBudget(value: string) {
    setValue("budget", value, { shouldDirty: true, shouldValidate: true });
  }

  const deliveryLabel = availableEtraps.find(
    ({ id }) => id === quote?.deliveryEtrapId,
  );
  const deliveryName = quote
    ? quote.deliveryWelayatName
      ? `${quote.deliveryWelayatName} · ${quote.deliveryEtrapName ?? "Этрап"}`
      : "Не выбран"
    : deliveryLabel
      ? `${deliveryLabel.welayatNameRu} · ${deliveryLabel.nameRu}`
      : "Не выбран";

  return (
    <section className="admin-section meal-config-calculator" data-testid="meal-config-calculator">
      <InventoryDashboard />
      <RecipeInventoryConfigurator />
      <header className="section-head">
        <h1>Калькулятор бюджета меню</h1>
        <p>
          Выберите блюда, задайте бюджет и получите, какие позиции лучше убрать
          для укладки в лимит.
        </p>
      </header>
      <article className="table-card">
        <div className="card-title">
          <h2>Параметры расчёта</h2>
          <p>Блюда и параметры тарификации берутся из текущего админского каталога.</p>
        </div>
        {lastQuoteError && <p className="form-error">{lastQuoteError}</p>}
        <form
          className="editor-card"
          data-testid="meal-calculator-form"
          onSubmit={handleSubmit(handleRun)}
          noValidate
        >
          <div className="form-grid">
            <label>
              <span>Бюджет, TMT</span>
              <input
                data-testid="meal-calculator-budget"
                placeholder="Например, 250.00"
                {...register("budget")}
                aria-invalid={Boolean(errors.budget)}
                inputMode="decimal"
              />
              <FormFieldError message={errors.budget?.message} />
            </label>
            <label>
              <span>Этрап доставки</span>
              <select
                data-testid="meal-calculator-delivery"
                {...register("deliveryEtrapId")}
                aria-invalid={Boolean(errors.deliveryEtrapId)}
              >
                <option value="">Без тарифа</option>
                {availableEtraps.map((etrap) => (
                  <option key={etrap.id} value={String(etrap.id)}>
                    {etrap.welayatNameRu} · {etrap.nameRu} ({etrap.price} TMT)
                  </option>
                ))}
              </select>
              <FormFieldError message={errors.deliveryEtrapId?.message} />
            </label>
            <label>
              <span>Промокод</span>
              <input
                data-testid="meal-calculator-promo"
                {...register("promoCode")}
                aria-invalid={Boolean(errors.promoCode)}
                placeholder="WELCOME15"
              />
              <FormFieldError message={errors.promoCode?.message} />
            </label>
            <label className="wide-field">
              <span>Поиск по блюдам</span>
              <input
                data-testid="meal-calculator-search"
                value={productSearch}
                onChange={(event) => setProductSearch(event.target.value)}
                placeholder="Название или описание"
              />
            </label>
          </div>
          <div className="toolbar">
            <button
              className="secondary-button"
              type="button"
              data-testid="meal-calculator-clear"
              onClick={clearSelection}
            >
              Очистить выбор
            </button>
            <button
              className="secondary-button"
              type="button"
              data-testid="meal-calculator-budget-150"
              onClick={() => setPresetBudget("150")}
            >
              Бюджет 150
            </button>
            <button
              className="secondary-button"
              type="button"
              data-testid="meal-calculator-budget-250"
              onClick={() => setPresetBudget("250")}
            >
              Бюджет 250
            </button>
            <button
              className="primary-button"
              type="submit"
              data-testid="meal-calculator-submit"
              disabled={quoteMutation.isPending}
            >
              {quoteMutation.isPending ? "Считаем..." : "Посчитать"}
            </button>
          </div>
        </form>
      </article>
      <article className="table-card">
        <div className="card-title">
          <h2>Сборка меню</h2>
          <p>Выберите количество по каждому блюду.</p>
        </div>
        <div className="toolbar">
          {productsQuery.isLoading && <p>Загрузка каталога…</p>}
          {productsQuery.error && (
            <p className="form-error">
              Не удалось загрузить каталог: {(productsQuery.error as Error).message}
            </p>
          )}
          {(!productsQuery.isLoading && filteredProducts.length === 0) && (
            <p>Нет доступных активных блюд по выбранным критериям.</p>
          )}
        </div>
        <div className="form-grid">
          {groupedProducts.map((group) => (
            <section key={group.id} className="table-card" data-testid={`meal-group-${group.id}`}>
              <div className="card-title">
                <h3>{group.name}</h3>
              </div>
              <div className="form-grid">
                {group.products.flatMap((product) => {
                  if (product.pricingType === "FIXED") {
                    const selected = selectionByKey[selectionKey(product.id)] ?? 0;
                    return [
                      <label
                        key={selectionKey(product.id)}
                        className="wide-field"
                      >
                        <span>
                          {product.name} — {formatMoney(product.price)}
                        </span>
                        <span>{product.description}</span>
                        <div className="toolbar">
                          <button
                            type="button"
                            className="text-button"
                            data-testid={`meal-calculator-decrease-${selectionKey(product.id)}`}
                            onClick={() => changeQuantity(selectionKey(product.id), -1)}
                          >
                            -1
                          </button>
                          <input
                        type="number"
                            data-testid={`meal-calculator-quantity-${selectionKey(product.id)}`}
                            min={0}
                            max={50}
                            value={selected}
                            onChange={(event) =>
                              setSelectionByKey((current: SelectionByKey) => ({
                                ...current,
                                [selectionKey(product.id)]:
                                  Math.max(0, Math.min(50, Number(event.target.value) || 0)),
                              }))
                            }
                          />
                          <button
                            type="button"
                            className="text-button"
                            data-testid={`meal-calculator-increase-${selectionKey(product.id)}`}
                            onClick={() => changeQuantity(selectionKey(product.id), 1)}
                          >
                            +1
                          </button>
                        </div>
                      </label>,
                    ];
                  }

                  return activeVariants(product).map((variant) => {
                    const selected =
                      selectionByKey[selectionKey(product.id, variant.id)] ?? 0;
                    return (
                      <label
                        key={selectionKey(product.id, variant.id)}
                        className="wide-field"
                      >
                        <span>
                          {product.name} — {product.variantLabel || "Вариант"}{" "}
                          {variant.name} — {formatMoney(variant.price)}
                        </span>
                        <span>{variant.description ?? "Без описания"}</span>
                        <div className="toolbar">
                          <button
                            type="button"
                            className="text-button"
                            data-testid={`meal-calculator-decrease-${selectionKey(product.id, variant.id)}`}
                            onClick={() =>
                              changeQuantity(
                                selectionKey(product.id, variant.id),
                                -1,
                              )
                            }
                          >
                            -1
                          </button>
                          <input
                            type="number"
                            data-testid={`meal-calculator-quantity-${selectionKey(product.id, variant.id)}`}
                            min={0}
                            max={50}
                            value={selected}
                            onChange={(event) =>
                              setSelectionByKey((current: SelectionByKey) => ({
                                ...current,
                                [selectionKey(product.id, variant.id)]:
                                  Math.max(
                                    0,
                                    Math.min(50, Number(event.target.value) || 0),
                                  ),
                              }))
                            }
                          />
                          <button
                            type="button"
                            className="text-button"
                            data-testid={`meal-calculator-increase-${selectionKey(product.id, variant.id)}`}
                            onClick={() =>
                              changeQuantity(
                                selectionKey(product.id, variant.id),
                                1,
                              )
                            }
                          >
                            +1
                          </button>
                        </div>
                      </label>
                    );
                  });
                })}
              </div>
            </section>
          ))}
        </div>
      </article>
      {quote && (
        <article className="table-card" data-testid="meal-calculator-result">
          <div className="card-title">
            <h2>Результат</h2>
          </div>
          <div className="form-grid">
            <section>
              <p>Итоговая сумма: {formatMoney(quote.total)}</p>
              <p>Подытог: {formatMoney(quote.subtotal)}</p>
              <p>Скидка: {formatMoney(quote.discount)}</p>
              <p>
                Доставка:
                {quote.deliveryFee ? ` ${formatMoney(quote.deliveryFee)}` : " 0.00 TMT"}
              </p>
              <p>
                Тарифная зона: {deliveryName}
              </p>
            </section>
            <section>
              <h3>Итог по позициям</h3>
              <ul>
                {quote.items.map((item) => (
                  <li key={`${item.productId}-${item.productVariantId ?? "base"}`}>
                    <div>
                      <strong>{mealQuoteLineLabel(item)}</strong>
                    </div>
                    <div>
                      {item.quantity} × {formatMoney(item.unitPrice)} ={" "}
                      {formatMoney(item.discountedLineTotal)} после скидки
                    </div>
                  </li>
                ))}
              </ul>
              {quote.promo && (
                <p>
                  Промокод {quote.promo.code}: -{formatMoney(quote.promo.discount)}
                </p>
              )}
              {quote.promo === null && (
                <p>Промокод не применён или не указан.</p>
              )}
            </section>
            {lastQuoteBudget !== null && budgetAdvice && (
              <section>
                {budgetAdvice.currentTotal <= lastQuoteBudget ? (
                  <p>
                    Бюджет {formatMoney(lastQuoteBudget)} соблюдается.
                    Остаток {formatMoney(lastQuoteBudget - budgetAdvice.currentTotal)}.
                  </p>
                ) : (
                  <p>
                    Бюджет превышен на {formatMoney(budgetAdvice.currentTotal - lastQuoteBudget)}.
                  </p>
                )}
                {budgetAdvice.suggestions.length > 0 && (
                  <>
                    <h3>Вариант сокращения меню</h3>
                    <ul>
                      {budgetAdvice.suggestions.map((suggestion) => (
                        <li key={`${suggestion.productId}-${suggestion.productVariantId ?? "base"}`}>
                          Уберите {suggestion.removeQuantity} ×{" "}
                          {suggestion.label} = {formatMoney(suggestion.removedValue)}
                        </li>
                      ))}
                    </ul>
                    <p>
                      После изменения количества нажмите «Посчитать»: доставка
                      и скидка могут измениться.
                    </p>
                  </>
                )}
              </section>
            )}
          </div>
        </article>
      )}
    </section>
  );
}
