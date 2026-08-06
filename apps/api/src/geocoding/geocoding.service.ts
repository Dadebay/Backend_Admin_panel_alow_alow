import { Injectable, Logger } from "@nestjs/common";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse";
const PHOTON_URL = "https://photon.komoot.io/reverse";
const REQUEST_TIMEOUT_MS = 8_000;
// Nominatim's usage policy requires an identifying UA on every request.
const USER_AGENT = "alowalow-api/1.0";

/**
 * Turns a map point into a short, human line — "Parahat 7, Görogly köçesi"
 * style. Runs server-side rather than on the device: OSM's public geocoders
 * sit behind hosts that mobile networks in some of the app's markets block
 * outright, the same reason road routing already goes through this API
 * instead of straight to OSRM (see RoutingService) rather than the device
 * calling it directly.
 */
@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name);

  async reverseGeocode(lat: number, lon: number): Promise<string | null> {
    return (await this.tryNominatim(lat, lon)) ?? (await this.tryPhoton(lat, lon));
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
      this.logger.warn(`Reverse geocode request to ${url.hostname} failed: ${error}`);
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async tryNominatim(lat: number, lon: number): Promise<string | null> {
    const url = new URL(NOMINATIM_URL);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lon));
    url.searchParams.set("zoom", "18");
    // Turkmen first, Russian and English as fallbacks — OSM's own tag
    // coverage for Ashgabat is inconsistent about which of the three a
    // given place actually has.
    url.searchParams.set("accept-language", "tk,ru,en");

    const json = await this.fetchJson(url, { "user-agent": USER_AGENT });
    if (!isRecord(json)) return null;

    const address = json.address;
    if (isRecord(address)) {
      const parts: string[] = [];
      const district = firstString(address.city_district, address.county, address.district);
      if (district) parts.push(district);
      const suburb = firstString(address.suburb, address.neighbourhood, address.residential);
      if (suburb) parts.push(suburb);
      const road = firstString(address.road, address.pedestrian);
      const houseNumber = firstString(address.house_number);
      if (road) parts.push(houseNumber ? `${road} ${houseNumber}` : road);
      if (parts.length > 0) return parts.join(", ");
    }

    const displayName = firstString(json.display_name);
    // Nominatim's fallback is the whole "street, district, city, country"
    // chain — only the first segment reads as a district name.
    return displayName ? (displayName.split(",")[0] ?? displayName).trim() : null;
  }

  private async tryPhoton(lat: number, lon: number): Promise<string | null> {
    const url = new URL(PHOTON_URL);
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lon));

    const json = await this.fetchJson(url);
    if (!isRecord(json) || !Array.isArray(json.features) || json.features.length === 0) {
      return null;
    }
    const props = (json.features[0] as Record<string, unknown>)?.properties;
    if (!isRecord(props)) return null;

    const parts: string[] = [];
    const city = firstString(props.city);
    const district = firstString(props.district);
    const street = firstString(props.street);
    const name = firstString(props.name);
    if (city) parts.push(city);
    if (district) parts.push(district);
    if (street) parts.push(street);
    if (name && name !== city) parts.push(name);

    return parts.length > 0 ? parts.join(", ") : null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}
