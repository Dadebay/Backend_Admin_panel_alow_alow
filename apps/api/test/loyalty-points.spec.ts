import { describe, expect, it } from "vitest";
import { earnedPoints, redemptionPoints } from "../src/loyalty/loyalty-points";
import { Prisma } from "../src/generated/prisma/client";

describe("loyalty point calculation", () => {
  it("multiplies each product's point value by its quantity", () => {
    expect(earnedPoints([{ points: 2, quantity: 3 }, { points: 7, quantity: 1 }])).toBe(13);
  });

  it("uses the gift's snapshotted cost and quantity", () => {
    expect(redemptionPoints([{ pointsCost: 20, quantity: 2 }, { pointsCost: 35, quantity: 1 }])).toBe(75);
  });

  it("keeps fractional points exact across quantities and products", () => {
    expect(earnedPoints([{ points: 0.65, quantity: 3 }, { points: new Prisma.Decimal("0.1"), quantity: 3 }])).toBe(2.25);
    expect(earnedPoints([{ points: 0.1, quantity: 1 }, { points: 0.2, quantity: 1 }])).toBe(0.3);
    expect(earnedPoints([{ points: 0.01, quantity: 100 }])).toBe(1);
    expect(earnedPoints([])).toBe(0);
  });

  it.each([0, -1, 0.001, 0.655, Number.POSITIVE_INFINITY, Number.NaN])("rejects invalid product points %s", (points) => {
    expect(() => earnedPoints([{ points, quantity: 1 }])).toThrow(RangeError);
  });

  it("rejects overflow and zero or fractional quantities", () => {
    expect(() => earnedPoints([{ points: 1, quantity: 0 }])).toThrow(RangeError);
    expect(() => earnedPoints([{ points: 0.65, quantity: 1.5 }])).toThrow(RangeError);
    expect(() => earnedPoints([{ points: 100000, quantity: 100000 }])).toThrow(RangeError);
    expect(earnedPoints([{ points: 2_147_483_647, quantity: 1 }])).toBe(2_147_483_647);
    expect(() => redemptionPoints([{ pointsCost: 0.65, quantity: 1 }])).toThrow(RangeError);
    expect(() => redemptionPoints([{ pointsCost: 10, quantity: 1.2 }])).toThrow(RangeError);
    expect(() => redemptionPoints([{ pointsCost: Number.MAX_SAFE_INTEGER, quantity: 2 }])).toThrow(RangeError);
  });
});
