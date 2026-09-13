import { lazy, Suspense, useState } from "react";
import { useSearchParams } from "react-router";
import { InventoryDashboard } from "@/src/widgets/inventory-dashboard";
import "./meal-config-calculator.css";

const Ingredients = lazy(() =>
  import("./ingredient-manager").then((module) => ({
    default: module.IngredientManager,
  })),
);
const Recipes = lazy(() =>
  import("./recipe-inventory-configurator").then((module) => ({
    default: module.RecipeInventoryConfigurator,
  })),
);
const Budget = lazy(() =>
  import("./menu-budget-planner").then((module) => ({
    default: module.MenuBudgetPlanner,
  })),
);
const sections = [
  { id: "stock", label: "Остатки", number: "01" },
  { id: "ingredients", label: "Ингредиенты", number: "02" },
  { id: "recipes", label: "Рецептуры", number: "03" },
  { id: "budget", label: "Бюджет меню", number: "04" },
] as const;
type Section = (typeof sections)[number]["id"];

export function MealConfigCalculator() {
  const [recipeDirty, setRecipeDirty] = useState(false);
  const [params, setParams] = useSearchParams();
  const section =
    sections.find((item) => item.id === params.get("view"))?.id ?? "stock";
  function navigate(next: Section, create = false) {
    if (
      next !== section &&
      recipeDirty &&
      !window.confirm(
        "Рецептура не сохранена. Перейти в другой раздел без сохранения?",
      )
    )
      return;
    if (next !== section) setRecipeDirty(false);
    const updated = new URLSearchParams(params);
    updated.set("view", next);
    updated.delete("productId");
    if (create) updated.set("new", "1");
    else updated.delete("new");
    setParams(updated);
  }
  return (
    <section
      className="admin-section inventory-workspace"
      data-testid="meal-config-calculator"
    >
      <header className="inventory-page-head">
        <div>
          <span className="inventory-kicker">УЧЁТ КУХНИ</span>
          <h1>Склад и рецептуры</h1>
          <p>Запасы в филиалах, состав блюд и стоимость приготовления.</p>
        </div>
        <details className="inventory-help">
          <summary data-testid="inventory-help-toggle">
            Как работает учёт <span aria-hidden="true">?</span>
          </summary>
          <div>
            <strong>Один раз настройте — дальше автоматически</strong>
            <ol>
              <li>Добавьте ингредиенты и их закупочные цены.</li>
              <li>Внесите начальные остатки в каждом филиале.</li>
              <li>Укажите состав блюда и количество порций.</li>
            </ol>
            <p>
              Новый заказ спишет продукты по рецепту. Разрешённая отмена до
              передачи курьеру вернёт их на склад. После передачи возврата нет.
            </p>
          </div>
        </details>
      </header>
      <nav className="inventory-tabs" aria-label="Разделы учёта">
        {sections.map((item) => (
          <button
            key={item.id}
            type="button"
            data-testid={"inventory-tab-" + item.id}
            aria-current={section === item.id ? "page" : undefined}
            onClick={() => navigate(item.id)}
          >
            <span>{item.number}</span>
            {item.label}
          </button>
        ))}
      </nav>
      <div className="inventory-tab-content" key={section}>
        <Suspense
          fallback={
            <div className="inventory-skeleton" role="status">
              Загружаем раздел…
            </div>
          }
        >
          {section === "stock" && (
            <InventoryDashboard
              onAddIngredient={() => navigate("ingredients", true)}
              onOpenRecipes={() => navigate("recipes")}
            />
          )}
          {section === "ingredients" && (
            <Ingredients onReceive={() => navigate("stock")} />
          )}
          {section === "recipes" && (
            <Recipes
              onDirtyChange={setRecipeDirty}
              onAddIngredient={() => navigate("ingredients", true)}
            />
          )}
          {section === "budget" && <Budget />}
        </Suspense>
      </div>
    </section>
  );
}
