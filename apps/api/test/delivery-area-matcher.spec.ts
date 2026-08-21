import { describe, expect, it } from "vitest";
import { findDeliveryAreaForAddress } from "../src/delivery/delivery-area-matcher";

const candidates = [
  { id: 1, nameRu: "Беркарарлыкский", nameTk: "Berkararlyk", nameEn: null },
  { id: 2, nameRu: "Копетдагский", nameTk: "Köpetdag", nameEn: "Kopetdag" },
];

describe("delivery area matcher", () => {
  it("matches the etrap named by reverse geocoding", () => {
    expect(
      findDeliveryAreaForAddress(
        candidates,
        "Kemine köçesi, Berkararlyk etraby, Aşgabat şäheri",
      )?.id,
    ).toBe(1);
  });

  it("folds Turkmen diacritics", () => {
    expect(findDeliveryAreaForAddress(candidates, "Kopetdag etraby")?.id).toBe(
      2,
    );
  });

  it("rejects unknown and ambiguous area text", () => {
    expect(findDeliveryAreaForAddress(candidates, "Kemine köçesi")).toBeNull();
    expect(
      findDeliveryAreaForAddress(
        [
          ...candidates,
          { id: 3, nameRu: "Другой", nameTk: "Köpetdag", nameEn: null },
        ],
        "Köpetdag etraby",
      ),
    ).toBeNull();
  });
});
