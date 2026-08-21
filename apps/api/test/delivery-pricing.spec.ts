import { describe, expect, it } from "vitest";
import { calculateDeliveryFee } from "../src/delivery/delivery-pricing";

describe("delivery pricing", () => {
  it("charges the configured price below the free threshold", () => {
    expect(calculateDeliveryFee(149.99, 15, 150)).toBe(15);
  });

  it("becomes free at the configured threshold", () => {
    expect(calculateDeliveryFee(150, 15, 150)).toBe(0);
    expect(calculateDeliveryFee(250, 25, 200)).toBe(0);
  });

  it("keeps charging when the free threshold is disabled", () => {
    expect(calculateDeliveryFee(10_000, 25, null)).toBe(25);
  });
});
