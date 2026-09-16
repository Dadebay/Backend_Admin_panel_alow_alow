import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { AdminPages, CurrentUser, Roles } from "../common/auth.decorators";
import type { AuthUser } from "../common/auth.types";
import { AdminPage, Role } from "../generated/prisma/client";
import {
  AdjustInventoryStockDto,
  CreateIngredientDto,
  InventoryStockQueryDto,
  InventoryMovementQueryDto,
  UpdateIngredientDto,
  UpsertRecipeDto,
} from "./inventory.dto";
import {
  InventoryAlertResponseDto,
  InventoryIngredientResponseDto,
  InventoryRecipeResponseDto,
  InventoryStockResponseDto,
  InventoryMovementResponseDto,
} from "./inventory-response.dto";
import { InventoryService } from "./inventory.service";

@ApiTags("inventory")
@ApiBearerAuth()
@Roles(Role.OPERATOR, Role.COOK, Role.ADMIN)
@Controller("inventory")
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get("ingredients")
  @AdminPages(AdminPage.MEAL_CONFIG, AdminPage.ORDERS)
  @ApiOperation({ summary: "List recipe ingredients" })
  @ApiOkResponse({ type: [InventoryIngredientResponseDto] })
  listIngredients() {
    return this.inventory.listIngredients();
  }

  @Post("ingredients")
  @Roles(Role.ADMIN)
  @AdminPages(AdminPage.MEAL_CONFIG)
  @ApiOperation({ summary: "Create an ingredient" })
  @ApiCreatedResponse({ type: InventoryIngredientResponseDto })
  createIngredient(
    @CurrentUser() actor: AuthUser,
    @Body() dto: CreateIngredientDto,
  ) {
    return this.inventory.createIngredient(actor, dto);
  }

  @Patch("ingredients/:id")
  @Roles(Role.ADMIN)
  @AdminPages(AdminPage.MEAL_CONFIG)
  @ApiOperation({ summary: "Update an ingredient" })
  @ApiOkResponse({ type: InventoryIngredientResponseDto })
  updateIngredient(
    @CurrentUser() actor: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateIngredientDto,
  ) {
    return this.inventory.updateIngredient(actor, id, dto);
  }

  @Get("recipes")
  @AdminPages(AdminPage.MEAL_CONFIG, AdminPage.ORDERS)
  @ApiOperation({ summary: "List configured product recipes" })
  @ApiOkResponse({ type: [InventoryRecipeResponseDto] })
  listRecipes() {
    return this.inventory.listRecipes();
  }

  @Get("recipes/:productId")
  @AdminPages(AdminPage.MEAL_CONFIG, AdminPage.ORDERS)
  @ApiOperation({ summary: "Get a product recipe" })
  @ApiOkResponse({ type: InventoryRecipeResponseDto })
  getRecipe(@Param("productId", ParseUUIDPipe) productId: string) {
    return this.inventory.getRecipe(productId);
  }

  @Put("recipes/:productId")
  @Roles(Role.ADMIN)
  @AdminPages(AdminPage.MEAL_CONFIG)
  @ApiOperation({ summary: "Create or replace a product recipe" })
  @ApiOkResponse({ type: InventoryRecipeResponseDto })
  upsertRecipe(
    @CurrentUser() actor: AuthUser,
    @Param("productId", ParseUUIDPipe) productId: string,
    @Body() dto: UpsertRecipeDto,
  ) {
    return this.inventory.upsertRecipe(actor, productId, dto);
  }

  @Get("stock")
  @AdminPages(AdminPage.MEAL_CONFIG, AdminPage.ORDERS)
  @ApiOperation({ summary: "List stock by branch and ingredient" })
  @ApiOkResponse({ type: [InventoryStockResponseDto] })
  listStock(@Query() query: InventoryStockQueryDto) {
    return this.inventory.listStock(query);
  }

  @Get("alerts")
  @AdminPages(AdminPage.MEAL_CONFIG, AdminPage.ORDERS)
  @ApiOperation({ summary: "List ingredients at or below reorder point" })
  @ApiOkResponse({ type: [InventoryAlertResponseDto] })
  listAlerts(@Query() query: InventoryStockQueryDto) {
    return this.inventory.listAlerts(query);
  }

  @Get("movements")
  @AdminPages(AdminPage.MEAL_CONFIG, AdminPage.ORDERS)
  @ApiOperation({
    summary:
      "List recent stock decreases for the in-app inventory notification feed",
  })
  @ApiOkResponse({ type: [InventoryMovementResponseDto] })
  listMovements(@Query() query: InventoryMovementQueryDto) {
    return this.inventory.listMovements(query);
  }

  @Post("stock/:ingredientId/adjust")
  @Roles(Role.ADMIN)
  @AdminPages(AdminPage.MEAL_CONFIG)
  @ApiOperation({ summary: "Adjust ingredient stock" })
  @ApiCreatedResponse({ type: InventoryStockResponseDto })
  adjustStock(
    @CurrentUser() actor: AuthUser,
    @Param("ingredientId", ParseUUIDPipe) ingredientId: string,
    @Body() dto: AdjustInventoryStockDto,
  ) {
    return this.inventory.adjustStock(actor, ingredientId, dto);
  }
}
