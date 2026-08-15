import type { ConfigService } from "@nestjs/config";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../src/config/env";
import { GeocodingService } from "../src/geocoding/geocoding.service";

function config() {
  const values: Partial<AppEnv> = {
    GEOCODING_PRIMARY_URL: "https://nominatim.example.test",
    GEOCODING_FALLBACK_URL: "https://photon.example.test",
    GEOCODING_USER_AGENT: "AlowAlow-Tests/1.0",
  };
  return {
    get: vi.fn((key: keyof AppEnv) => values[key]),
  } as unknown as ConfigService<AppEnv, true>;
}

function internalConfig() {
  const values: Partial<AppEnv> = {
    GEOCODING_PRIMARY_URL: "http://geocoding:8080",
    GEOCODING_FALLBACK_URL: "https://photon.example.test",
    GEOCODING_USER_AGENT: "AlowAlow-Tests/1.0",
  };
  return {
    get: vi.fn((key: keyof AppEnv) => values[key]),
  } as unknown as ConfigService<AppEnv, true>;
}

function jsonResponse(value: unknown) {
  return {
    ok: true,
    json: vi.fn().mockResolvedValue(value),
  } as unknown as Response;
}

describe("geocoding service", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("searches Turkmenistan names explicitly and caches identical requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse([
        {
          lat: "37.95021",
          lon: "58.38021",
          display_name: "Parahat 7, Aşgabat, Türkmenistan",
          namedetails: {
            name: "Parahat 7",
            "name:ru": "Парахат 7",
          },
        },
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);
    const service = new GeocodingService(config());

    const first = await service.search("  Parahat   7  ", 1);
    const second = await service.search("Parahat 7", 1);

    expect(first).toEqual([
      {
        label: "Parahat 7, Aşgabat, Türkmenistan",
        latitude: 37.95021,
        longitude: 58.38021,
        aliases: ["Parahat 7", "Парахат 7"],
        provider: "NOMINATIM",
      },
    ]);
    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [requestedUrl, options] = fetchMock.mock.calls[0] as unknown as [
      URL,
      RequestInit,
    ];
    expect(requestedUrl.hostname).toBe("nominatim.example.test");
    expect(requestedUrl.searchParams.get("q")).toBe("Parahat 7");
    expect(requestedUrl.searchParams.get("countrycodes")).toBe("tm");
    expect(requestedUrl.searchParams.get("namedetails")).toBe("1");
    expect(options.headers).toMatchObject({
      "user-agent": "AlowAlow-Tests/1.0",
    });
  });

  it("uses Photon when the primary provider has no matching place", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(
        jsonResponse({
          features: [
            {
              geometry: { coordinates: [58.381, 37.951] },
              properties: {
                name: "Неофициальный ориентир",
                district: "Parahat 7",
                city: "Aşgabat",
              },
            },
          ],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const service = new GeocodingService(config());

    await expect(service.search("ориентир", 3)).resolves.toEqual([
      {
        label: "Неофициальный ориентир, Parahat 7, Aşgabat",
        latitude: 37.951,
        longitude: 58.381,
        aliases: ["Parahat 7", "Aşgabat"],
        provider: "PHOTON",
      },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const fallbackUrl = fetchMock.mock.calls[1]?.[0] as unknown as URL;
    expect(fallbackUrl.hostname).toBe("photon.example.test");
    expect(fallbackUrl.searchParams.get("bbox")).toBe("52.4,35.1,66.7,42.8");
  });

  it("uses the self-hosted provider without waiting for an unreachable public fallback", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]));
    vi.stubGlobal("fetch", fetchMock);
    const service = new GeocodingService(internalConfig());

    await expect(service.search("Garaşsyzlyk 60", 6)).resolves.toEqual([]);
    await expect(service.reverseGeocode(37.96, 58.32)).resolves.toBeNull();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [requestedUrl] of fetchMock.mock.calls as unknown as [[URL]]) {
      expect(requestedUrl.hostname).toBe("geocoding");
    }
  });

  it("drops provider results with invalid coordinates", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse([
          { lat: "999", lon: "58.3", display_name: "Invalid primary" },
        ]),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          features: [
            {
              geometry: { coordinates: [999, 37.9] },
              properties: { name: "Invalid fallback" },
            },
          ],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const service = new GeocodingService(config());

    await expect(service.search("invalid", 3)).resolves.toEqual([]);
  });
});
