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
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Public, Roles } from "../common/auth.decorators";
import { Role } from "../generated/prisma/client";
import {
  AddProductImageDto,
  CreateCategoryDto,
  CreateProductDto,
  UpdateCategoryDto,
  UpdateProductDto,
} from "./catalog.dto";
import { CatalogService } from "./catalog.service";

@ApiTags("catalog")
@Controller("catalog")
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get("categories")
  @Public()
  @ApiOperation({ summary: "List public categories with products" })
  categories() {
    return this.catalog.categories();
  }

  @Get("products")
  @Public()
  @ApiOperation({ summary: "List public products" })
  products(@Query("categoryId") categoryId?: string) {
    return this.catalog.products(categoryId);
  }

  @Get("admin/categories")
  @ApiBearerAuth()
  @Roles(Role.ADMIN, Role.OPERATOR)
  @ApiOperation({ summary: "List categories including hidden records" })
  adminCategories() {
    return this.catalog.categories(true);
  }

  @Post("categories")
  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  createCategory(@Body() dto: CreateCategoryDto) {
    return this.catalog.createCategory(dto);
  }

  @Patch("categories/:id")
  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  updateCategory(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.catalog.updateCategory(id, dto);
  }

  @Get("admin/products")
  @ApiBearerAuth()
  @Roles(Role.ADMIN, Role.OPERATOR)
  adminProducts(@Query("categoryId") categoryId?: string) {
    return this.catalog.products(categoryId, true);
  }

  @Post("products")
  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  createProduct(@Body() dto: CreateProductDto) {
    return this.catalog.createProduct(dto);
  }

  @Patch("products/:id")
  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  updateProduct(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.catalog.updateProduct(id, dto);
  }

  @Post("products/:id/images")
  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  addImage(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: AddProductImageDto,
  ) {
    return this.catalog.addImage(id, dto);
  }
}
