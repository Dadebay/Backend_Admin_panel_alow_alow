import { useMutation } from "@tanstack/react-query";
import type { components } from "@alowalow/api-contract";
import { useSession } from "@/src/shared/auth";

export type MealQuoteBody = components["schemas"]["QuoteOrderDto"];
export type MealQuoteResponse = components["schemas"]["OrderQuoteResponseDto"];

export function useMealConfigCalculatorQuote() {
  const { authorizedRequest } = useSession();

  return useMutation<MealQuoteResponse, Error, MealQuoteBody>({
    mutationFn: (body) =>
      authorizedRequest<MealQuoteResponse>("/orders/quote", {
        method: "POST",
        body: JSON.stringify(body),
      }),
  });
}
