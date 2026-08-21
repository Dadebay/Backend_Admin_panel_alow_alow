const DELIVERY_ADDRESS_STOP_WORDS = new Set([
  "asgabat",
  "city",
  "district",
  "etrap",
  "etraby",
  "etrapca",
  "koc",
  "kocesi",
  "mkr",
  "nci",
  "nji",
  "njy",
  "pr",
  "prospekt",
  "rayon",
  "rayony",
  "saheri",
  "sayoly",
  "seheri",
  "street",
  "tapgyr",
  "turkmenistan",
  "ul",
]);

export type DeliveryAreaCandidate = {
  id: number;
  nameRu: string;
  nameTk: string;
  nameEn: string | null;
};

function foldDeliveryAddress(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[çÇ]/g, "c")
    .replace(/[ňŇ]/g, "n")
    .replace(/[şŞ]/g, "s")
    .replace(/[ýÝ]/g, "y")
    .toLocaleLowerCase("ru-RU");
}

function significantDeliveryAddressTokens(value: string) {
  return (foldDeliveryAddress(value).match(/[\p{L}\p{N}]+/gu) ?? []).filter(
    (token) => token.length >= 4 && !DELIVERY_ADDRESS_STOP_WORDS.has(token),
  );
}

/**
 * Matches only an unambiguous configured area name. Coordinates are not
 * treated as polygons: when geocoding does not name exactly one area, callers
 * keep the fallback quote and require an explicit area selection.
 */
export function findDeliveryAreaForAddress<T extends DeliveryAreaCandidate>(
  candidates: readonly T[],
  addressLine: string | null,
): T | null {
  if (!addressLine) return null;
  const addressTokens = new Set(significantDeliveryAddressTokens(addressLine));
  if (!addressTokens.size) return null;

  const matches = candidates
    .map((candidate) => {
      const score = [candidate.nameRu, candidate.nameTk, candidate.nameEn]
        .filter((name): name is string => Boolean(name))
        .reduce((best, name) => {
          const tokens = new Set(significantDeliveryAddressTokens(name));
          const matchedScore = [...tokens].reduce(
            (sum, token) => sum + (addressTokens.has(token) ? token.length : 0),
            0,
          );
          return Math.max(best, matchedScore);
        }, 0);
      return { candidate, score };
    })
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score);

  const best = matches[0];
  if (!best || best.score === matches[1]?.score) return null;
  return best.candidate;
}
