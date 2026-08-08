import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AppEnv } from "../config/env";

const REQUEST_TIMEOUT_MS = 8_000;
const PUBLIC_PROVIDER_INTERVAL_MS = 1_100;
const CACHE_TTL_MS = 24 * 60 * 60 * 1_000;
const MAX_CACHE_ENTRIES = 500;
const TURKMENISTAN_BBOX = "52.4,35.1,66.7,42.8";
const ASHGABAT_VIEWBOX = "58.1,38.2,58.7,37.7";

export type GeocodingProvider = "NOMINATIM" | "PHOTON";

export type GeocodingSearchResult = {
  label: string;
  latitude: number;
  longitude: number;
  aliases: string[];
  provider: GeocodingProvider;
};

type CacheEntry<T> = { expiresAt: number; value: T };

/**
 * Server-side OSM geocoding adapter. Search is explicit-submit only: the
 * public Nominatim service forbids autocomplete and limits an application to
 * one request per second. The queue and bounded cache enforce that contract
 * for the single-process DEV deployment; production can switch both provider
 * origins through environment variables without a mobile/admin release.
 */
@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name);
  private readonly primaryUrl: string;
  private readonly fallbackUrl: string;
  private readonly userAgent: string;
  private readonly searchCache = new Map<
    string,
    CacheEntry<GeocodingSearchResult[]>
  >();
  private readonly reverseCache = new Map<string, CacheEntry<string | null>>();
  private primaryQueue: Promise<void> = Promise.resolve();
  private lastPrimaryRequestAt = 0;

  constructor(config: ConfigService<AppEnv, true>) {
    this.primaryUrl = config.get("GEOCODING_PRIMARY_URL", { infer: true });
    this.fallbackUrl = config.get("GEOCODING_FALLBACK_URL", { infer: true });
    this.userAgent = config.get("GEOCODING_USER_AGENT", { infer: true });
  }

  async reverseGeocode(lat: number, lon: number): Promise<string | null> {
    const key = `${lat.toFixed(5)}:${lon.toFixed(5)}`;
    const cached = this.readCache(this.reverseCache, key);
    if (cached.hit) return cached.value;

    const value =
      (await this.tryNominatimReverse(lat, lon)) ??
      (await this.tryPhotonReverse(lat, lon));
    this.writeCache(this.reverseCache, key, value);
    return value;
  }

  async search(query: string, limit: number): Promise<GeocodingSearchResult[]> {
    const normalized = query.trim().replace(/\s+/g, " ");
    const key = `${normalized.toLocaleLowerCase("ru-RU")}:${limit}`;
    const cached = this.readCache(this.searchCache, key);
    if (cached.hit) return cached.value;

    const primary = await this.tryNominatimSearch(normalized, limit);
    const fallback =
      primary.length < limit
        ? await this.tryPhotonSearch(normalized, limit)
        : [];
    const items = this.deduplicate([...primary, ...fallback]).slice(0, limit);
    this.writeCache(this.searchCache, key, items);
    return items;
  }

  private async tryNominatimSearch(
    query: string,
    limit: number,
  ): Promise<GeocodingSearchResult[]> {
    const url = this.providerUrl(this.primaryUrl, "search");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("q", query);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("countrycodes", "tm");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("namedetails", "1");
    url.searchParams.set("accept-language", "tk,ru,en");
    url.searchParams.set("viewbox", ASHGABAT_VIEWBOX);

    const json = await this.fetchPrimary(url);
    if (!Array.isArray(json)) return [];
    return json.flatMap((item) => {
      if (!isRecord(item)) return [];
      const latitude = finiteCoordinate(item.lat, -90, 90);
      const longitude = finiteCoordinate(item.lon, -180, 180);
      const label = firstString(item.display_name);
      if (latitude === null || longitude === null || !label) return [];
      const namedetails = isRecord(item.namedetails) ? item.namedetails : {};
      const aliases = uniqueStrings(Object.values(namedetails), label);
      return [
        {
          label,
          latitude,
          longitude,
          aliases,
          provider: "NOMINATIM" as const,
        },
      ];
    });
  }

  private async tryPhotonSearch(
    query: string,
    limit: number,
  ): Promise<GeocodingSearchResult[]> {
    const url = this.providerUrl(this.fallbackUrl, "api");
    url.searchParams.set("q", query);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("lang", "ru");
    url.searchParams.set("bbox", TURKMENISTAN_BBOX);

    const json = await this.fetchJson(url);
    if (!isRecord(json) || !Array.isArray(json.features)) return [];
    return json.features.flatMap((feature) => {
      if (!isRecord(feature)) return [];
      const geometry = isRecord(feature.geometry) ? feature.geometry : null;
      const coordinates = geometry?.coordinates;
      const properties = isRecord(feature.properties)
        ? feature.properties
        : null;
      if (!Array.isArray(coordinates) || !properties) return [];
      const longitude = finiteCoordinate(coordinates[0], -180, 180);
      const latitude = finiteCoordinate(coordinates[1], -90, 90);
      if (latitude === null || longitude === null) return [];
      const parts = uniqueStrings([
        properties.name,
        properties.street,
        properties.district,
        properties.city,
        properties.state,
      ]);
      if (!parts.length) return [];
      const label = parts.join(", ");
      return [
        {
          label,
          latitude,
          longitude,
          aliases: parts.slice(1),
          provider: "PHOTON" as const,
        },
      ];
    });
  }

  private async tryNominatimReverse(
    lat: number,
    lon: number,
  ): Promise<string | null> {
    const url = this.providerUrl(this.primaryUrl, "reverse");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lon));
    url.searchParams.set("zoom", "18");
    url.searchParams.set("accept-language", "tk,ru,en");

    const json = await this.fetchPrimary(url);
    if (!isRecord(json)) return null;
    const address = json.address;
    if (isRecord(address)) {
      const parts: string[] = [];
      const district = firstString(
        address.city_district,
        address.county,
        address.district,
      );
      if (district) parts.push(district);
      const suburb = firstString(
        address.suburb,
        address.neighbourhood,
        address.residential,
      );
      if (suburb) parts.push(suburb);
      const road = firstString(address.road, address.pedestrian);
      const houseNumber = firstString(address.house_number);
      if (road) parts.push(houseNumber ? `${road} ${houseNumber}` : road);
      if (parts.length > 0) return [...new Set(parts)].join(", ");
    }
    const displayName = firstString(json.display_name);
    return displayName
      ? (displayName.split(",")[0] ?? displayName).trim()
      : null;
  }

  private async tryPhotonReverse(
    lat: number,
    lon: number,
  ): Promise<string | null> {
    const url = this.providerUrl(this.fallbackUrl, "reverse");
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lon));

    const json = await this.fetchJson(url);
    if (
      !isRecord(json) ||
      !isUnknownArray(json.features) ||
      !json.features[0]
    ) {
      return null;
    }
    const feature = json.features[0];
    const props =
      isRecord(feature) && isRecord(feature.properties)
        ? feature.properties
        : null;
    if (!props) return null;
    const parts = uniqueStrings([
      props.city,
      props.district,
      props.street,
      props.name,
    ]);
    return parts.length ? parts.join(", ") : null;
  }

  private fetchPrimary(url: URL) {
    const task = this.primaryQueue.then(async () => {
      const waitMs = Math.max(
        0,
        PUBLIC_PROVIDER_INTERVAL_MS - (Date.now() - this.lastPrimaryRequestAt),
      );
      if (waitMs) {
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
      this.lastPrimaryRequestAt = Date.now();
      return this.fetchJson(url, { "user-agent": this.userAgent });
    });
    this.primaryQueue = task.then(
      () => undefined,
      () => undefined,
    );
    return task;
  }

  private async fetchJson(url: URL, headers?: Record<string, string>) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { accept: "application/json", ...headers },
      });
      if (!response.ok) return null;
      return (await response.json()) as unknown;
    } catch (error) {
      const detail = error instanceof Error ? error.name : "unknown error";
      this.logger.warn(
        `Geocoding request to ${url.hostname} failed: ${detail}`,
      );
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  private providerUrl(base: string, path: string) {
    return new URL(path, `${base.replace(/\/+$/, "")}/`);
  }

  private deduplicate(items: GeocodingSearchResult[]) {
    const seen = new Set<string>();
    return items.filter((item) => {
      const key = `${item.latitude.toFixed(5)}:${item.longitude.toFixed(5)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private readCache<T>(cache: Map<string, CacheEntry<T>>, key: string) {
    const entry = cache.get(key);
    if (!entry) return { hit: false as const, value: undefined };
    if (entry.expiresAt <= Date.now()) {
      cache.delete(key);
      return { hit: false as const, value: undefined };
    }
    return { hit: true as const, value: entry.value };
  }

  private writeCache<T>(
    cache: Map<string, CacheEntry<T>>,
    key: string,
    value: T,
  ) {
    if (cache.size >= MAX_CACHE_ENTRIES) {
      const oldest = cache.keys().next().value;
      if (oldest) cache.delete(oldest);
    }
    cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function finiteCoordinate(
  value: unknown,
  minimum: number,
  maximum: number,
): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : null;
}

function uniqueStrings(values: unknown[], excluded?: string) {
  const normalizedExcluded = excluded?.toLocaleLowerCase("ru-RU");
  return [
    ...new Set(
      values
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(
          (value) =>
            value &&
            value.length <= 300 &&
            value.toLocaleLowerCase("ru-RU") !== normalizedExcluded,
        ),
    ),
  ].slice(0, 10);
}
