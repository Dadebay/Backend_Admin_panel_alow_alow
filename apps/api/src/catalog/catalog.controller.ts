import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { CurrentUser, Public, Roles } from "../common/auth.decorators";
import type { AuthUser } from "../common/auth.types";
import { Role } from "../generated/prisma/client";
import {
  AddProductImageDto,
  CreateCategoryDto,
  CreateProductDto,
  UpdateCategoryDto,
  UpdateProductDto,
} from "./catalog.dto";
import { CatalogService } from "./catalog.service";
import {
  CatalogCategoryResponseDto,
  CatalogCategorySummaryResponseDto,
  CatalogProductImageResponseDto,
  CatalogProductResponseDto,
} from "./catalog-response.dto";

@ApiTags("catalog")
@Controller("catalog")
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get("categories")
  @Public()
  @ApiOperation({ summary: "List public categories with products" })
  @ApiOkResponse({ type: [CatalogCategoryResponseDto] })
  categories() {
    return this.catalog.categories();
  }

  @Get("products")
  @Public()
  @ApiOperation({ summary: "List public products" })
  @ApiOkResponse({ type: [CatalogProductResponseDto] })
  products(@Query("categoryId") categoryId?: string) {
    return this.catalog.products(categoryId);
  }

  @Get("admin/categories")
  @ApiBearerAuth()
  @Roles(Role.ADMIN, Role.OPERATOR)
  @ApiOperation({ summary: "List categories including hidden records" })
  @ApiOkResponse({ type: [CatalogCategoryResponseDto] })
  adminCategories() {
    return this.catalog.categories(true);
  }

  @Post("categories")
  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @ApiCreatedResponse({ type: CatalogCategorySummaryResponseDto })
  createCategory(
    @CurrentUser() actor: AuthUser,
    @Body() dto: CreateCategoryDto,
  ) {
    return this.catalog.createCategory(actor, dto);
  }

  @Patch("categories/:id")
  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @ApiOkResponse({ type: CatalogCategorySummaryResponseDto })
  updateCategory(
    @CurrentUser() actor: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.catalog.updateCategory(actor, id, dto);
  }

  @Get("admin/products")
  @ApiBearerAuth()
  @Roles(Role.ADMIN, Role.OPERATOR)
  @ApiOkResponse({ type: [CatalogProductResponseDto] })
  adminProducts(@Query("categoryId") categoryId?: string) {
    return this.catalog.products(categoryId, true);
  }

  @Post("products")
  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @ApiCreatedResponse({ type: CatalogProductResponseDto })
  createProduct(
    @CurrentUser() actor: AuthUser,
    @Body() dto: CreateProductDto,
  ) {
    return this.catalog.createProduct(actor, dto);
  }

  @Patch("products/:id")
  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @ApiOkResponse({ type: CatalogProductResponseDto })
  updateProduct(
    @CurrentUser() actor: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.catalog.updateProduct(actor, id, dto);
  }

  @Post("products/:id/images")
  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @ApiCreatedResponse({ type: CatalogProductImageResponseDto })
  addImage(
    @CurrentUser() actor: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: AddProductImageDto,
  ) {
    return this.catalog.addImage(actor, id, dto);
  }
}
