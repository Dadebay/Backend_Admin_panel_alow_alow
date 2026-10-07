import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import boundaries from "../src/delivery/data/delivery-service-area.json";
import {
  assertDeliveryServiceArea,
  pointInServiceArea,
  type ServiceAreaPolygon,
} from "../src/delivery/delivery-service-area";

describe("Ahal and Ashgabat delivery service area", () => {
  it.each([
    ["Ashgabat", 37.95, 58.38],
    ["Berzengi", 37.8890173, 58.3754883],
    ["Anau", 37.89, 58.51],
    ["Baherden", 38.436, 57.431],
    ["Kaka", 37.351, 59.617],
    ["Tejen", 37.3834, 60.4963],
  ])("allows %s", (_name, latitude, longitude) => {
    expect(pointInServiceArea({ latitude, longitude })).toBe(true);
    expect(() =>
      assertDeliveryServiceArea({ latitude, longitude }),
    ).not.toThrow();
  });

  it.each([
    ["Mary", 37.6, 61.83],
    ["Balkanabat", 39.51, 54.36],
    ["Dashoguz", 41.836, 59.965],
    ["Turkmenabat", 39.073, 63.578],
    ["Iran inside the region bounding rectangle", 36.3, 57.8],
    ["invalid location", Number.NaN, 58.38],
  ])("rejects %s", (_name, latitude, longitude) => {
    const point = { latitude, longitude };
    expect(pointInServiceArea(point)).toBe(false);
    try {
      assertDeliveryServiceArea(point);
      expect.fail("Expected an unavailable delivery address");
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        statusCode: 400,
        code: "OUTSIDE_DELIVERY_AREA",
      });
    }
  });

  it("requires a location for personal checkout", () => {
    expect(() => assertDeliveryServiceArea()).toThrow(BadRequestException);
  });

  it("fails closed for empty polygons or invalid longitude", () => {
    expect(
      pointInServiceArea({ latitude: 37.95, longitude: 58.38 }, [[]]),
    ).toBe(false);
    expect(pointInServiceArea({ latitude: 37.95, longitude: Number.NaN })).toBe(
      false,
    );
  });

  it("preserves full rings, including the Ashgabat hole in the Ahal polygon", () => {
    expect(boundaries.regions.map(({ iso3166_2 }) => iso3166_2)).toEqual([
      "TM-A",
      "TM-S",
    ]);
    const ahal = boundaries.regions[0]!;
    const ashgabat = boundaries.regions[1]!;
    expect(ahal.polygons[0]![0]!.length).toBeGreaterThan(64);
    const vertices = (ring: number[][]) =>
      [...new Set(ring.map((coordinate) => JSON.stringify(coordinate)))].sort();
    expect(vertices(ahal.polygons[0]![1]!)).toEqual(
      vertices(ashgabat.polygons[0]![0]!),
    );
    for (const region of boundaries.regions) {
      for (const polygon of region.polygons) {
        for (const ring of polygon) {
          expect(ring.length).toBeGreaterThanOrEqual(4);
          expect(ring[0]).toEqual(ring.at(-1));
          expect(
            ring.every(
              ([longitude, latitude]) =>
                Number.isFinite(latitude) && Number.isFinite(longitude),
            ),
          ).toBe(true);
        }
      }
    }
  });

  it("keeps holes excluded, includes borders and supports disconnected polygons", () => {
    const square = (start: number, end: number) => [
      { latitude: start, longitude: start },
      { latitude: start, longitude: end },
      { latitude: end, longitude: end },
      { latitude: end, longitude: start },
    ];
    const areas: ServiceAreaPolygon[] = [
      [square(0, 10), square(3, 7)],
      [square(20, 30)],
    ];
    expect(pointInServiceArea({ latitude: 1, longitude: 1 }, areas)).toBe(true);
    expect(pointInServiceArea({ latitude: 5, longitude: 5 }, areas)).toBe(
      false,
    );
    expect(pointInServiceArea({ latitude: 0, longitude: 5 }, areas)).toBe(true);
    expect(pointInServiceArea({ latitude: 3, longitude: 5 }, areas)).toBe(true);
    expect(pointInServiceArea({ latitude: 25, longitude: 25 }, areas)).toBe(
      true,
    );
    expect(pointInServiceArea({ latitude: 15, longitude: 15 }, areas)).toBe(
      false,
    );
  });

  it("accepts a point on the actual service boundary", () => {
    const [longitude, latitude] = boundaries.regions[0]!.polygons[0]![0]![0]!;
    expect(
      pointInServiceArea({ latitude: latitude!, longitude: longitude! }),
    ).toBe(true);
  });
});
