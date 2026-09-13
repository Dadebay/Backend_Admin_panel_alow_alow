import assert from "node:assert/strict";
import test from "node:test";
import { mealCalculatorFormSchema } from "../src/features/meal-config-calculator/model/meal-config-calculator-form.ts";
import { buildMealBudgetAdvice } from "../src/features/meal-config-calculator/model/meal-config-calculator.ts";

test("meal calculator schema normalizes and validates budget, promo and optional etrap", () => {
  assert.deepEqual(
    mealCalculatorFormSchema.parse({
      deliveryEtrapId: "25",
      promoCode: " welcome15 ",
      budget: "250.50",
    }),
    {
      deliveryEtrapId: "25",
      promoCode: "WELCOME15",
      budget: "250.50",
    },
  );
  assert.equal(
    mealCalculatorFormSchema.safeParse({
      deliveryEtrapId: "",
      promoCode: "TOO_LOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO_LONG",
      budget: "999",
    }).success,
    false,
  );
  assert.equal(
    mealCalculatorFormSchema.safeParse({
      deliveryEtrapId: "0",
      promoCode: "WELCOME15",
      budget: "250",
    }).success,
    false,
  );
  assert.equal(
    mealCalculatorFormSchema.safeParse({
      deliveryEtrapId: "",
      promoCode: "",
      budget: "1,5",
    }).success,
    true,
  );
  assert.equal(
    mealCalculatorFormSchema.safeParse({
      deliveryEtrapId: "-3",
      promoCode: "",
      budget: "250",
    }).success,
    false,
  );
  assert.equal(
    mealCalculatorFormSchema.safeParse({
      deliveryEtrapId: "",
      promoCode: "",
      budget: "12.345",
    }).success,
    false,
  );
});

test("meal budget advice suggests removing most expensive lines first", () => {
  const quote = {
    items: [
      {
        productId: "p1",
        productVariantId: null,
        productName: "Суп",
        variantName: null,
        productImageUrl: null,
        quantity: 2,
        unitPrice: 40,
        originalLineTotal: 80,
        discount: 0,
        discountedLineTotal: 80,
      },
      {
        productId: "p2",
        productVariantId: null,
        productName: "Плов",
        variantName: null,
        productImageUrl: null,
        quantity: 1,
        unitPrice: 35,
        originalLineTotal: 35,
        discount: 0,
        discountedLineTotal: 35,
      },
      {
        productId: "p3",
        productVariantId: "v1",
        productName: "Кефир",
        variantName: "1.0 л",
        productImageUrl: null,
        quantity: 1,
        unitPrice: 15,
        originalLineTotal: 15,
        discount: 0,
        discountedLineTotal: 15,
      },
    ],
    total: 130,
    subtotal: 130,
    discount: 0,
    discountedSubtotal: 130,
    deliveryFee: 0,
    deliveryEtrapId: 1,
    deliveryWelayatName: null,
    deliveryEtrapName: null,
    promo: null,
  };

  const advice = buildMealBudgetAdvice(quote, 100);

  assert.equal(advice?.canFit, true);
  assert.equal(advice?.remainingBudget, 10);
  assert.equal(advice?.finalTotal, 90);
  assert.equal(advice?.suggestions.length, 1);
  assert.deepEqual(advice?.suggestions[0], {
    productId: "p1",
    productVariantId: null,
    label: "Суп",
    removeQuantity: 1,
    removedValue: 40,
  });
});

test("meal budget advice handles null budget as no recommendation", () => {
  const quote = {
    items: [
      {
        productId: "p1",
        productVariantId: null,
        productName: "Суп",
        variantName: null,
        productImageUrl: null,
        quantity: 1,
        unitPrice: 40,
        originalLineTotal: 40,
        discount: 0,
        discountedLineTotal: 40,
      },
    ],
    total: 40,
    subtotal: 40,
    discount: 0,
    discountedSubtotal: 40,
    deliveryFee: 0,
    deliveryEtrapId: 1,
    deliveryWelayatName: null,
    deliveryEtrapName: null,
    promo: null,
  };

  assert.equal(buildMealBudgetAdvice(quote, undefined), null);
  assert.equal(buildMealBudgetAdvice(quote, Number.NaN), null);
});
