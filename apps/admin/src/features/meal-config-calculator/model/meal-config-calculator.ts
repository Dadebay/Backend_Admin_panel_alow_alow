import type { components } from "@alowalow/api-contract";

type QuoteLine = components["schemas"]["OrderQuoteItemResponseDto"];
type QuoteResult = components["schemas"]["OrderQuoteResponseDto"];

export type MealBudgetAdviceLine = {
  productId: string;
  productVariantId: string | null;
  label: string;
  removeQuantity: number;
  removedValue: number;
};

export type MealBudgetAdvice = {
  budget: number;
  currentTotal: number;
  finalTotal: number;
  remainingBudget: number;
  overBy: number;
  canFit: boolean;
  suggestions: MealBudgetAdviceLine[];
};

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export function mealQuoteLineLabel(item: QuoteLine) {
  return item.variantName
    ? `${item.productName} (${item.variantName})`
    : item.productName;
}

export function buildMealBudgetAdvice(
  quote: QuoteResult,
  budget: number | undefined,
): MealBudgetAdvice | null {
  if (budget === undefined || !Number.isFinite(budget)) {
    return null;
  }

  const normalizedBudget = roundMoney(Math.max(0, budget));
  const currentTotal = roundMoney(quote.total);

  const unitLines = quote.items
    .map((item) => {
      const unitCost =
        item.quantity === 0 ? 0 : roundMoney(item.discountedLineTotal / item.quantity);
      return {
        item,
        unitCost,
      };
    })
    .filter(({ unitCost }) => unitCost > 0)
    .sort((left, right) => right.unitCost - left.unitCost);

  if (currentTotal <= normalizedBudget || unitLines.length === 0) {
    return {
      budget: normalizedBudget,
      currentTotal,
      finalTotal: currentTotal,
      remainingBudget: roundMoney(Math.max(0, normalizedBudget - currentTotal)),
      overBy: 0,
      canFit: currentTotal <= normalizedBudget,
      suggestions: [],
    };
  }

  let finalTotal = currentTotal;
  const suggestions: MealBudgetAdviceLine[] = [];

  for (const { item, unitCost } of unitLines) {
    if (finalTotal <= normalizedBudget) {
      break;
    }

    const needed = finalTotal - normalizedBudget;
    const removeQuantity = Math.min(
      item.quantity,
      Math.ceil(needed / unitCost),
    );
    if (!removeQuantity) {
      continue;
    }

    const removedValue = roundMoney(removeQuantity * unitCost);
    finalTotal = roundMoney(finalTotal - removedValue);
    suggestions.push({
      productId: item.productId,
      productVariantId: item.productVariantId,
      label: mealQuoteLineLabel(item),
      removeQuantity,
      removedValue,
    });
  }

  const canFit = finalTotal <= normalizedBudget;
  return {
    budget: normalizedBudget,
    currentTotal,
    finalTotal,
    remainingBudget: canFit ? roundMoney(normalizedBudget - finalTotal) : 0,
    overBy: canFit ? 0 : roundMoney(finalTotal - normalizedBudget),
    canFit,
    suggestions,
  };
}

export function formatMoney(value: number) {
  return `${value.toFixed(2)} TMT`;
}
