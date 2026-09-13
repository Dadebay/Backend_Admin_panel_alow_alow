import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  useAdminProducts,
  filterOrderableProducts,
} from "@/src/entities/catalog";
import {
  useDeliveryConfig,
  flattenDeliveryEtraps,
} from "@/src/entities/delivery";
import {
  mealCalculatorFormSchema,
  buildMealBudgetAdvice,
  useMealConfigCalculatorQuote,
  formatMoney,
  type MealCalculatorFormInput,
  type MealCalculatorFormValues,
} from "@/src/features/meal-config-calculator";
import { FormFieldError } from "@/src/shared/forms";

export function MenuBudgetPlanner() {
  const products = useAdminProducts();
  const delivery = useDeliveryConfig();
  const quote = useMealConfigCalculatorQuote();
  const [search, setSearch] = useState("");
  const [selection, setSelection] = useState<Record<string, number>>({});
  const [quotedSignature, setQuotedSignature] = useState("");
  const form = useForm<
    MealCalculatorFormInput,
    unknown,
    MealCalculatorFormValues
  >({
    resolver: zodResolver(mealCalculatorFormSchema),
    defaultValues: { budget: "", deliveryEtrapId: "", promoCode: "" },
  });
  const values = useWatch({ control: form.control });
  const catalog = filterOrderableProducts(products.data ?? [], {
    query: "",
  }).flatMap((product) =>
    product.pricingType === "FIXED"
      ? [
          {
            key: `${product.id}:base`,
            productId: product.id,
            variantId: undefined as string | undefined,
            name: product.name,
            price: product.price,
          },
        ]
      : product.variants
          .filter((variant) => variant.isActive)
          .map((variant) => ({
            key: `${product.id}:${variant.id}`,
            productId: product.id,
            variantId: variant.id,
            name: `${product.name} · ${variant.name}`,
            price: variant.price,
          })),
  );
  const visible = catalog.filter((item) =>
    item.name
      .toLocaleLowerCase("ru")
      .includes(search.trim().toLocaleLowerCase("ru")),
  );
  const chosen = catalog.filter((item) => (selection[item.key] ?? 0) > 0);
  const signature = JSON.stringify({ selection, ...values });
  const fresh = quote.data && signature === quotedSignature;
  const budget = values.budget?.trim()
    ? Number(values.budget.replace(",", "."))
    : null;
  const advice =
    fresh && quote.data && budget !== null
      ? buildMealBudgetAdvice(quote.data, budget)
      : null;
  function change(key: string, delta: number) {
    setSelection((current) => {
      const next = { ...current };
      const count = Math.max(0, Math.min(50, (next[key] ?? 0) + delta));
      if (count) next[key] = count;
      else delete next[key];
      return next;
    });
  }
  async function calculate(data: MealCalculatorFormValues) {
    if (!chosen.length) return;
    const submittedSignature = signature;
    try {
      await quote.mutateAsync({
        items: chosen.map((item) => ({
          productId: item.productId,
          variantId: item.variantId,
          quantity: selection[item.key],
        })),
        deliveryEtrapId: data.deliveryEtrapId
          ? Number(data.deliveryEtrapId)
          : undefined,
        promoCode: data.promoCode || undefined,
      });
      setQuotedSignature(submittedSignature);
    } catch {
      /* The current request error remains visible. */
    }
  }
  return (
    <section data-testid="inventory-budget">
      <div className="inventory-view-head">
        <div>
          <h2>Подберите меню под бюджет</h2>
          <p>
            Добавьте блюда и получите стоимость с доставкой и скидкой. Заказ не
            создаётся.
          </p>
        </div>
      </div>
      <div className="budget-layout">
        <div className="budget-catalog">
          <label className="inventory-search">
            <span className="sr-only">Поиск блюда</span>
            <input
              type="search"
              placeholder="Найти блюдо…"
              data-testid="meal-calculator-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          {products.isPending ? (
            <div className="inventory-skeleton" role="status">
              Загружаем меню…
            </div>
          ) : products.error ? (
            <div className="inventory-empty" role="alert">
              <p>{products.error.message}</p>
              <button
                className="secondary-button"
                data-testid="meal-calculator-products-retry"
                onClick={() => void products.refetch()}
              >
                Повторить
              </button>
            </div>
          ) : (
            <div className="budget-product-list">
              {visible.map((item) => (
                <article className="budget-product" key={item.key}>
                  <div>
                    <strong>{item.name}</strong>
                    <span>{formatMoney(item.price)} / порция</span>
                  </div>
                  <button
                    className="stock-receive"
                    type="button"
                    aria-label={`Добавить ${item.name}`}
                    data-testid={`meal-calculator-add-${item.key}`}
                    disabled={
                      quote.isPending || (selection[item.key] ?? 0) >= 50
                    }
                    onClick={() => change(item.key, 1)}
                  >
                    {selection[item.key]
                      ? `+ Ещё (${selection[item.key]})`
                      : "+ Добавить"}
                  </button>
                </article>
              ))}
              {!visible.length && (
                <div className="inventory-empty">
                  <h3>Блюда не найдены</h3>
                  <p>
                    {search
                      ? "Попробуйте другое название."
                      : "Добавьте доступные блюда в меню."}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
        <form
          className="budget-selection inventory-form"
          data-testid="meal-calculator-form"
          onSubmit={form.handleSubmit(calculate)}
          noValidate
        >
          <fieldset disabled={quote.isPending}>
            <div className="budget-selection-head">
              <h3>
                Ваше меню <span>{chosen.length}</span>
              </h3>
              {chosen.length > 0 && (
                <button
                  type="button"
                  className="text-button"
                  data-testid="meal-calculator-clear"
                  onClick={() => setSelection({})}
                >
                  Очистить
                </button>
              )}
            </div>
            {!chosen.length ? (
              <div className="budget-empty">
                <p>Здесь появятся выбранные блюда</p>
                <span>Нажмите «+ Добавить» в меню.</span>
              </div>
            ) : (
              <div className="budget-chosen">
                {chosen.map((item) => (
                  <div className="budget-chosen-row" key={item.key}>
                    <div>
                      <strong>{item.name}</strong>
                      <span>
                        {formatMoney(item.price * selection[item.key])}
                      </span>
                    </div>
                    <div className="budget-stepper">
                      <button
                        type="button"
                        aria-label={`Уменьшить ${item.name}`}
                        data-testid={`meal-calculator-decrease-${item.key}`}
                        onClick={() => change(item.key, -1)}
                      >
                        −
                      </button>
                      <output
                        aria-label={`Порции ${item.name}`}
                        data-testid={`meal-calculator-quantity-${item.key}`}
                      >
                        {selection[item.key]}
                      </output>
                      <button
                        type="button"
                        aria-label={`Увеличить ${item.name}`}
                        data-testid={`meal-calculator-increase-${item.key}`}
                        onClick={() => change(item.key, 1)}
                        disabled={selection[item.key] >= 50}
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <label>
              Бюджет, TMT{" "}
              <span className="inventory-optional">необязательно</span>
              <input
                inputMode="decimal"
                placeholder="Например, 250"
                data-testid="meal-calculator-budget"
                {...form.register("budget")}
              />
              <FormFieldError message={form.formState.errors.budget?.message} />
            </label>
            <label>
              Район доставки
              <select
                data-testid="meal-calculator-delivery"
                {...form.register("deliveryEtrapId")}
                disabled={delivery.isPending || Boolean(delivery.error)}
              >
                <option value="">Без района / базовая доставка</option>
                {flattenDeliveryEtraps(delivery.data).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.welayatNameRu} · {item.nameRu}
                  </option>
                ))}
              </select>
              <FormFieldError
                message={form.formState.errors.deliveryEtrapId?.message}
              />
            </label>
            {delivery.error && (
              <p className="error-text" role="alert">
                Не удалось загрузить доставку.{" "}
                <button
                  type="button"
                  className="text-button"
                  data-testid="meal-calculator-delivery-retry"
                  onClick={() => void delivery.refetch()}
                >
                  Повторить
                </button>
              </p>
            )}
            <label>
              Промокод <span className="inventory-optional">необязательно</span>
              <input
                placeholder="Введите промокод"
                data-testid="meal-calculator-promo"
                {...form.register("promoCode")}
              />
              <FormFieldError
                message={form.formState.errors.promoCode?.message}
              />
            </label>
            <button
              type="submit"
              className="primary-button"
              data-testid="meal-calculator-submit"
              disabled={
                !chosen.length || delivery.isPending || Boolean(delivery.error)
              }
            >
              {quote.isPending
                ? "Считаем…"
                : quote.data
                  ? "Пересчитать стоимость"
                  : "Рассчитать стоимость"}
            </button>
            {quote.error && (
              <p className="error-text" role="alert">
                {quote.error.message}
              </p>
            )}
            {quote.data && !fresh && (
              <p role="status" className="inventory-notice">
                Меню или условия изменились. Пересчитайте стоимость.
              </p>
            )}
            {fresh && quote.data && (
              <div
                className="budget-result"
                data-testid="meal-calculator-result"
                role="status"
              >
                <div>
                  <span>Блюда</span>
                  <b>{formatMoney(quote.data.subtotal)}</b>
                </div>
                <div>
                  <span>Доставка</span>
                  <b>{formatMoney(quote.data.deliveryFee)}</b>
                </div>
                <div>
                  <span>Скидка</span>
                  <b>−{formatMoney(quote.data.discount)}</b>
                </div>
                <div className="budget-total">
                  <span>Итого</span>
                  <strong>{formatMoney(quote.data.total)}</strong>
                </div>
                {budget !== null && Number.isFinite(budget) && (
                  <p
                    className={
                      quote.data.total <= budget
                        ? "budget-fits"
                        : "budget-exceeds"
                    }
                  >
                    {quote.data.total <= budget
                      ? `В бюджете. Осталось ${formatMoney(budget - quote.data.total)}.`
                      : `Выше бюджета на ${formatMoney(quote.data.total - budget)}. Уменьшите порции и пересчитайте.`}
                  </p>
                )}
                {advice && advice.suggestions.length > 0 && (
                  <details className="budget-advice">
                    <summary data-testid="meal-calculator-advice">
                      Как уменьшить сумму
                    </summary>
                    <ul>
                      {advice.suggestions.map((item) => (
                        <li
                          key={`${item.productId}:${item.productVariantId ?? "base"}`}
                        >
                          {item.label}: убрать {item.removeQuantity} порц.
                          (примерно −{formatMoney(item.removedValue)})
                        </li>
                      ))}
                    </ul>
                    <p>
                      После изменения пересчитайте меню: скидка и доставка могут
                      измениться.
                    </p>
                  </details>
                )}
              </div>
            )}
          </fieldset>
        </form>
      </div>
    </section>
  );
}
