import { describe, expect, it } from "vitest";
import {
  calculateDeliveryFee,
  calculateDistanceDeliveryFee,
  resolveDeliveryPeriod,
} from "../src/delivery/delivery-pricing";

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

describe("kilometer delivery pricing", () => {
  it.each([
    [0, 5, 15],
    [1_000, 5, 15],
    [3_200, 5, 15],
    [3_400, 5, 20],
    [4_000, 5, 20],
    [4_200, 5, 20],
    [4_400, 5, 25],
  ])("prices %i meters at %i manat/km as %i", (meters, rate, fee) => {
    expect(calculateDistanceDeliveryFee(meters, rate)).toBe(fee);
  });

  it("rounds fractional manat up before applying the 5-manat bands", () => {
    expect(calculateDistanceDeliveryFee(3_200, 5)).toBe(15);
    expect(calculateDistanceDeliveryFee(3_202, 5)).toBe(20);
  });

  it("rejects negative, non-finite, or unsafe inputs", () => {
    for (const [meters, rate] of [
      [-1, 5],
      [1_000, -1],
      [1_000, 0],
      [Number.NaN, 5],
      [1_000, Number.POSITIVE_INFINITY],
      [Number.MAX_VALUE, 5],
    ]) {
      expect(() => calculateDistanceDeliveryFee(meters, rate)).toThrow();
    }
  });
});

describe("night delivery clock in Ashgabat", () => {
  const settings = {
    nightTariffEnabled: true,
    nightStartsAt: "23:00",
    nightEndsAt: "07:00",
  };
  it.each([
    ["2026-09-12T17:59:59.999Z", "DAY", "2026-09-12T18:00:00.000Z"],
    ["2026-09-12T18:00:00.000Z", "NIGHT", "2026-09-13T02:00:00.000Z"],
    ["2026-09-12T19:00:00.000Z", "NIGHT", "2026-09-13T02:00:00.000Z"],
    ["2026-09-13T01:59:59.999Z", "NIGHT", "2026-09-13T02:00:00.000Z"],
    ["2026-09-13T02:00:00.000Z", "DAY", "2026-09-13T18:00:00.000Z"],
  ])("selects the tariff and expiry at %s", (at, tariff, validUntil) => {
    expect(resolveDeliveryPeriod(settings, new Date(at))).toEqual({
      tariff,
      validUntil,
      timeZone: "Asia/Ashgabat",
    });
  });
  it("keeps the day tariff when disabled", () => {
    expect(
      resolveDeliveryPeriod(
        { ...settings, nightTariffEnabled: false },
        new Date("2026-09-12T18:00:00Z"),
      ),
    ).toMatchObject({ tariff: "DAY", validUntil: null });
  });
  it("supports a configured interval within one calendar day and a midnight boundary", () => {
    expect(
      resolveDeliveryPeriod(
        { ...settings, nightStartsAt: "01:30", nightEndsAt: "06:15" },
        new Date("2026-09-12T20:30:00Z"),
      ),
    ).toMatchObject({
      tariff: "NIGHT",
      validUntil: "2026-09-13T01:15:00.000Z",
    });
    expect(
      resolveDeliveryPeriod(
        { ...settings, nightStartsAt: "00:00", nightEndsAt: "06:00" },
        new Date("2026-09-12T19:00:00Z"),
      ),
    ).toMatchObject({ tariff: "NIGHT" });
    expect(
      resolveDeliveryPeriod(
        { ...settings, nightStartsAt: "23:00", nightEndsAt: "00:00" },
        new Date("2026-09-12T19:00:00Z"),
      ),
    ).toMatchObject({ tariff: "DAY" });
  });
});
