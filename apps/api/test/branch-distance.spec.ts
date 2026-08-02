import { describe, expect, it } from "vitest";
import { distanceBetweenMeters } from "../src/branches/branch-distance";

describe("branch distance", () => {
  it("returns zero for the same point", () => {
    expect(
      distanceBetweenMeters(
        { latitude: 37.96, longitude: 58.38 },
        { latitude: 37.96, longitude: 58.38 },
      ),
    ).toBe(0);
  });

  it("calculates a stable straight-line distance in metres", () => {
    const distance = distanceBetweenMeters(
      { latitude: 37.95, longitude: 58.38 },
      { latitude: 37.96, longitude: 58.39 },
    );
    expect(distance).toBeGreaterThan(1_300);
    expect(distance).toBeLessThan(1_500);
  });
});
