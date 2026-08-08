import { Controller, Get, Query } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { Public, Roles } from "../common/auth.decorators";
import { Role } from "../generated/prisma/client";
import {
  ReverseGeocodeQueryDto,
  ReverseGeocodeResponseDto,
  SearchGeocodeQueryDto,
  SearchGeocodeResponseDto,
} from "./geocoding.dto";
import { GeocodingService } from "./geocoding.service";

@ApiTags("geocoding")
@Controller("geocoding")
export class GeocodingController {
  constructor(private readonly geocoding: GeocodingService) {}

  @Get("reverse")
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({
    summary:
      "Turn a map point into a short address line for the delivery-address form",
  })
  @ApiOkResponse({ type: ReverseGeocodeResponseDto })
  async reverse(
    @Query() query: ReverseGeocodeQueryDto,
  ): Promise<ReverseGeocodeResponseDto> {
    const line = await this.geocoding.reverseGeocode(query.lat, query.lon);
    return { line };
  }

  @Get("search")
  @ApiBearerAuth()
  @Roles(Role.CUSTOMER, Role.OPERATOR, Role.ADMIN)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: "Search Turkmenistan OSM names after an explicit user submit",
  })
  @ApiOkResponse({ type: SearchGeocodeResponseDto })
  async search(
    @Query() query: SearchGeocodeQueryDto,
  ): Promise<SearchGeocodeResponseDto> {
    return {
      items: await this.geocoding.search(query.q, query.limit),
      attribution: "© OpenStreetMap contributors",
    };
  }
}
