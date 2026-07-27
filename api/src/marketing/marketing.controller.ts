import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Public, Roles } from "../common/auth.decorators";
import { Role } from "../generated/prisma/client";
import {
  CreateBannerDto,
  CreatePromoCodeDto,
  UpdateBannerDto,
  UpdatePromoCodeDto,
} from "./marketing.dto";
import { MarketingService } from "./marketing.service";

@ApiTags("marketing")
@Controller("marketing")
export class MarketingController {
  constructor(private readonly marketing: MarketingService) {}

  @Get("banners")
  @Public()
  @ApiOperation({ summary: "List currently active customer banners" })
  banners() {
    return this.marketing.activeBanners();
  }

  @Get("admin/banners")
  @ApiBearerAuth()
  @Roles(Role.ADMIN, Role.OPERATOR)
  allBanners() {
    return this.marketing.allBanners();
  }

  @Post("banners")
  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  createBanner(@Body() dto: CreateBannerDto) {
    return this.marketing.createBanner(dto);
  }

  @Patch("banners/:id")
  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  updateBanner(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateBannerDto,
  ) {
    return this.marketing.updateBanner(id, dto);
  }

  @Get("promos")
  @ApiBearerAuth()
  @Roles(Role.ADMIN, Role.OPERATOR, Role.ACCOUNTANT)
  promos() {
    return this.marketing.promoCodes();
  }

  @Post("promos")
  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  createPromo(@Body() dto: CreatePromoCodeDto) {
    return this.marketing.createPromoCode(dto);
  }

  @Patch("promos/:id")
  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  updatePromo(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdatePromoCodeDto,
  ) {
    return this.marketing.updatePromoCode(id, dto);
  }
}
