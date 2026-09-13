import { useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAdminProducts } from "@/src/entities/catalog";
import {
  inventoryUnitLabels,
  useInventoryIngredients,
  useInventoryRecipes,
} from "@/src/entities/inventory";
import {
  ingredientFormSchema,
  recipeFormSchema,
  useInventoryActions,
  type IngredientFormInput,
  type IngredientFormValues,
  type RecipeFormInput,
  type RecipeFormValues,
} from "@/src/features/inventory-management";
import { FormFieldError } from "@/src/shared/forms";

export function RecipeInventoryConfigurator() {
  const products = useAdminProducts();
  const ingredients = useInventoryIngredients();
  const recipes = useInventoryRecipes();
  const actions = useInventoryActions();
  const [success, setSuccess] = useState("");
  const ingredientForm = useForm<
    IngredientFormInput,
    unknown,
    IngredientFormValues
  >({
    resolver: zodResolver(ingredientFormSchema),
    defaultValues: {
      name: "",
      unit: "GRAM",
      costPerUnit: "",
      reorderPoint: "0",
    },
  });
  const recipeForm = useForm<RecipeFormInput, unknown, RecipeFormValues>({
    resolver: zodResolver(recipeFormSchema),
    defaultValues: { productId: "", yieldQuantity: "1", ingredients: [] },
  });
  const lines = useFieldArray({
    control: recipeForm.control,
    name: "ingredients",
  });
  const productId = useWatch({
    control: recipeForm.control,
    name: "productId",
  });
  const selectedRecipe = recipes.data?.find(
    (recipe) => recipe.productId === productId,
  );
  function selectProduct(nextId: string) {
    const recipe = recipes.data?.find((item) => item.productId === nextId);
    recipeForm.reset({
      productId: nextId,
      yieldQuantity: String(recipe?.yieldQuantity ?? 1),
      ingredients:
        recipe?.ingredients.map((line) => ({
          ingredientId: line.ingredientId,
          quantity: String(line.quantity),
        })) ?? [],
    });
    actions.saveRecipe.reset();
    setSuccess("");
  }
  async function saveRecipe({ productId: id, ...payload }: RecipeFormValues) {
    setSuccess("");
    try {
      await actions.saveRecipe.mutateAsync({
        productId: id,
        payload: { ...payload, isActive: true },
      });
      setSuccess("Рецептура сохранена.");
    } catch {
      /* The mutation renders the API error below. */
    }
  }
  async function addIngredient(values: IngredientFormValues) {
    setSuccess("");
    try {
      await actions.createIngredient.mutateAsync(values);
      ingredientForm.reset();
      setSuccess("Ингредиент добавлен. Теперь можно оформить приход на склад.");
    } catch {
      /* The mutation renders the API error below. */
    }
  }
  const loading =
    products.isPending || ingredients.isPending || recipes.isPending;
  const loadError = products.error ?? ingredients.error ?? recipes.error;
  const mutationError =
    actions.createIngredient.error ?? actions.saveRecipe.error;
  const recipeErrors = recipeForm.formState.errors;
  const ingredientErrors = ingredientForm.formState.errors;
  return (
    <article className="table-card" data-testid="recipe-inventory-configurator">
      <div className="card-title">
        <div>
          <span className="eyebrow">Рецептуры</span>
          <h2>Состав и себестоимость блюда</h2>
          <p>
            Количество ингредиентов задаётся на весь выход рецепта. Для заказа
            расход делится на число порций. Один рецепт применяется ко всем
            вариантам блюда.
          </p>
        </div>
      </div>
      {loading && <p role="status">Загружаем рецептуры…</p>}
      {loadError && (
        <p className="error-text" role="alert">
          {loadError.message}{" "}
          <button
            className="text-button"
            type="button"
            data-testid="inventory-config-retry"
            onClick={() => {
              void products.refetch();
              void ingredients.refetch();
              void recipes.refetch();
            }}
          >
            Повторить
          </button>
        </p>
      )}
      {mutationError && (
        <p className="error-text" role="alert">
          {mutationError.message}
        </p>
      )}
      {success && (
        <p className="success-text" role="status">
          {success}
        </p>
      )}
      <div className="form-grid">
        <form
          className="form-stack"
          data-testid="inventory-recipe-form"
          onSubmit={recipeForm.handleSubmit(saveRecipe)}
          noValidate
        >
          <h3>Рецептура</h3>
          <label className="wide-field">
            <span>Блюдо</span>
            <select
              data-testid="inventory-recipe-product"
              {...recipeForm.register("productId")}
              onChange={(event) => selectProduct(event.target.value)}
              disabled={
                loading || Boolean(loadError) || actions.saveRecipe.isPending
              }
            >
              <option value="">Выберите блюдо</option>
              {products.data
                ?.filter((product) => product.isActive)
                .map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
            </select>
            <FormFieldError message={recipeErrors.productId?.message} />
          </label>
          <label className="wide-field">
            <span>Выход рецепта, порций</span>
            <input
              inputMode="decimal"
              data-testid="inventory-recipe-yield"
              {...recipeForm.register("yieldQuantity")}
            />
            <FormFieldError message={recipeErrors.yieldQuantity?.message} />
          </label>
          {lines.fields.map((line, index) => (
            <div className="inventory-recipe-line" key={line.id}>
              <label>
                <span>Ингредиент</span>
                <select
                  data-testid={`inventory-recipe-ingredient-${line.id}`}
                  {...recipeForm.register(`ingredients.${index}.ingredientId`)}
                >
                  <option value="">Выберите ингредиент</option>
                  {ingredients.data
                    ?.filter(
                      (ingredient) =>
                        ingredient.isActive ||
                        ingredient.id === line.ingredientId,
                    )
                    .map((ingredient) => (
                      <option key={ingredient.id} value={ingredient.id}>
                        {ingredient.name} (
                        {inventoryUnitLabels[ingredient.unit]})
                        {ingredient.isActive ? "" : " — выключен"}
                      </option>
                    ))}
                </select>
                <FormFieldError
                  message={
                    recipeErrors.ingredients?.[index]?.ingredientId?.message
                  }
                />
              </label>
              <label>
                <span>Количество</span>
                <input
                  inputMode="decimal"
                  data-testid={`inventory-recipe-quantity-${line.id}`}
                  {...recipeForm.register(`ingredients.${index}.quantity`)}
                />
                <FormFieldError
                  message={recipeErrors.ingredients?.[index]?.quantity?.message}
                />
              </label>
              <button
                type="button"
                className="text-button"
                data-testid={`inventory-recipe-remove-${line.id}`}
                onClick={() => lines.remove(index)}
                disabled={actions.saveRecipe.isPending}
              >
                Удалить
              </button>
            </div>
          ))}
          <FormFieldError
            message={
              recipeErrors.ingredients?.message ??
              recipeErrors.ingredients?.root?.message
            }
          />
          <div className="toolbar">
            <button
              type="button"
              className="secondary-button"
              data-testid="inventory-recipe-add-line"
              disabled={
                loading ||
                actions.saveRecipe.isPending ||
                lines.fields.length >= 100
              }
              onClick={() => lines.append({ ingredientId: "", quantity: "" })}
            >
              Добавить ингредиент
            </button>
            <button
              type="submit"
              className="primary-button"
              data-testid="inventory-recipe-save"
              disabled={
                loading || Boolean(loadError) || actions.saveRecipe.isPending
              }
            >
              {actions.saveRecipe.isPending
                ? "Сохраняем…"
                : "Сохранить рецептуру"}
            </button>
          </div>
          {productId && (
            <p className="muted-text">
              {selectedRecipe
                ? `Себестоимость партии: ${selectedRecipe.estimatedCost.toFixed(2)} TMT; порции: ${(selectedRecipe.estimatedCost / selectedRecipe.yieldQuantity).toFixed(2)} TMT. Сохранение заменяет состав рецепта.`
                : "Рецепт ещё не настроен — автосписание этого блюда пока не выполняется."}
            </p>
          )}
        </form>
        <form
          className="form-stack"
          data-testid="inventory-ingredient-form"
          onSubmit={ingredientForm.handleSubmit(addIngredient)}
          noValidate
        >
          <h3>Новый ингредиент</h3>
          <label className="wide-field">
            <span>Название</span>
            <input
              data-testid="inventory-ingredient-name"
              {...ingredientForm.register("name")}
              placeholder="Например, сыр"
            />
            <FormFieldError message={ingredientErrors.name?.message} />
          </label>
          <label className="wide-field">
            <span>Базовая единица</span>
            <select
              data-testid="inventory-ingredient-unit"
              {...ingredientForm.register("unit")}
            >
              <option value="GRAM">Грамм (1 мг = 0,001 г)</option>
              <option value="MILLILITER">Миллилитр</option>
              <option value="PIECE">Штука</option>
            </select>
          </label>
          <label className="wide-field">
            <span>Цена за базовую единицу, TMT</span>
            <input
              inputMode="decimal"
              data-testid="inventory-ingredient-cost"
              {...ingredientForm.register("costPerUnit")}
            />
            <FormFieldError message={ingredientErrors.costPerUnit?.message} />
          </label>
          <label className="wide-field">
            <span>Порог пополнения в базовых единицах</span>
            <input
              inputMode="decimal"
              data-testid="inventory-ingredient-threshold"
              {...ingredientForm.register("reorderPoint")}
            />
            <FormFieldError message={ingredientErrors.reorderPoint?.message} />
          </label>
          <p className="muted-text">
            При остатке на уровне порога или ниже склад покажет «Заканчивается».
            При нуле — «Нет в наличии».
          </p>
          <button
            type="submit"
            className="primary-button"
            data-testid="inventory-ingredient-save"
            disabled={actions.createIngredient.isPending}
          >
            {actions.createIngredient.isPending
              ? "Добавляем…"
              : "Добавить ингредиент"}
          </button>
        </form>
      </div>
    </article>
  );
}
