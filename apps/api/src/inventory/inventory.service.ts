import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { AuthUser } from "../common/auth.types";
import {
  InventoryMovementType,
  InventoryUnit,
  Prisma,
} from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  AdjustInventoryStockDto,
  CreateIngredientDto,
  InventoryStockQueryDto,
  InventoryMovementQueryDto,
  UpdateIngredientDto,
  UpsertRecipeDto,
} from "./inventory.dto";
import {
  calculateRecipeCost,
  getStockStatus,
  validateRecipeIngredientIds,
  validateStockMovement,
} from "./inventory-policy";

const recipeInclude = {
  product: { select: { name: true } },
  ingredients: { include: { ingredient: true } },
} satisfies Prisma.RecipeInclude;

type RecipeWithRelations = Prisma.RecipeGetPayload<{
  include: typeof recipeInclude;
}>;
function ingredientResponse(ingredient: {
  id: string;
  name: string;
  sku: string | null;
  unit: InventoryUnit;
  costPerUnit: Prisma.Decimal;
  reorderPoint: Prisma.Decimal;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...ingredient,
    costPerUnit: Number(ingredient.costPerUnit),
    reorderPoint: Number(ingredient.reorderPoint),
  };
}

function ingredientAudit(ingredient: Parameters<typeof ingredientResponse>[0]) {
  return {
    id: ingredient.id,
    name: ingredient.name,
    sku: ingredient.sku,
    unit: ingredient.unit,
    costPerUnit: ingredient.costPerUnit.toString(),
    reorderPoint: ingredient.reorderPoint.toString(),
    isActive: ingredient.isActive,
  };
}
function recipeAudit(recipe: RecipeWithRelations) {
  return {
    productId: recipe.productId,
    yieldQuantity: recipe.yieldQuantity.toString(),
    isActive: recipe.isActive,
    ingredients: recipe.ingredients.map((line) => ({
      ingredientId: line.ingredientId,
      quantity: line.quantity.toString(),
      unit: line.ingredient.unit,
    })),
  };
}

function recipeResponse(recipe: RecipeWithRelations) {
  const recipeIngredients = recipe.ingredients
    .sort((left, right) =>
      left.ingredient.name.localeCompare(right.ingredient.name),
    )
    .map((line) => ({
      id: line.id,
      ingredientId: line.ingredientId,
      quantity: Number(line.quantity),
      estimatedCost:
        Number(line.quantity) * Number(line.ingredient.costPerUnit),
      ingredient: ingredientResponse(line.ingredient),
    }));
  return {
    id: recipe.id,
    productId: recipe.productId,
    productName: recipe.product.name,
    yieldQuantity: Number(recipe.yieldQuantity),
    estimatedCost: calculateRecipeCost(
      recipeIngredients.map((line) => ({
        quantity: line.quantity,
        costPerUnit: Number(line.ingredient.costPerUnit),
      })),
    ),
    isActive: recipe.isActive,
    updatedAt: recipe.updatedAt,
    ingredients: recipeIngredients,
  };
}

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  private async configurationTransaction<T>(
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ) {
    try {
      return await this.prisma.$transaction(work, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034"
      ) {
        throw new ConflictException(
          "Рецептура или ингредиент изменились. Обновите данные и повторите операцию.",
        );
      }
      throw error;
    }
  }

  async listIngredients() {
    const ingredients = await this.prisma.ingredient.findMany({
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    });
    return ingredients.map(ingredientResponse);
  }

  createIngredient(actor: AuthUser, dto: CreateIngredientDto) {
    return this.prisma.$transaction(async (tx) => {
      try {
        const ingredient = await tx.ingredient.create({
          data: {
            name: dto.name.trim(),
            sku: dto.sku?.trim() || null,
            unit: dto.unit,
            costPerUnit: dto.costPerUnit,
            reorderPoint: dto.reorderPoint ?? 0,
          },
        });
        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            action: "inventory.ingredient.created",
            entityType: "Ingredient",
            entityId: ingredient.id,
            metadata: { after: ingredientAudit(ingredient) },
          },
        });
        return ingredientResponse(ingredient);
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        )
          throw new ConflictException("Ingredient SKU already exists");
        throw error;
      }
    });
  }

  updateIngredient(actor: AuthUser, id: string, dto: UpdateIngredientDto) {
    return this.configurationTransaction(async (tx) => {
      const current = await tx.ingredient.findUnique({ where: { id } });
      if (!current) throw new NotFoundException("Ingredient not found");
      if (dto.unit !== undefined && dto.unit !== current?.unit) {
        const [usedInRecipe, hasStock, hasHistory] = await Promise.all([
          tx.recipeIngredient.findFirst({
            where: { ingredientId: id },
            select: { id: true },
          }),
          tx.ingredientStock.findFirst({
            where: { ingredientId: id, quantity: { gt: 0 } },
            select: { id: true },
          }),
          tx.inventoryMovement.findFirst({
            where: { ingredientId: id },
            select: { id: true },
          }),
        ]);
        if (usedInRecipe || hasStock || hasHistory)
          throw new ConflictException(
            "Cannot change unit while ingredient has a recipe or stock",
          );
      }
      try {
        const ingredient = await tx.ingredient.update({
          where: { id },
          data: {
            ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
            ...(dto.sku !== undefined ? { sku: dto.sku?.trim() || null } : {}),
            ...(dto.unit !== undefined ? { unit: dto.unit } : {}),
            ...(dto.costPerUnit !== undefined
              ? { costPerUnit: dto.costPerUnit }
              : {}),
            ...(dto.reorderPoint !== undefined
              ? { reorderPoint: dto.reorderPoint }
              : {}),
            ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          },
        });
        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            action: "inventory.ingredient.updated",
            entityType: "Ingredient",
            entityId: id,
            metadata: {
              changedFields: Object.keys(dto),
              before: ingredientAudit(current),
              after: ingredientAudit(ingredient),
            },
          },
        });
        return ingredientResponse(ingredient);
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        )
          throw new ConflictException("Ingredient SKU already exists");
        throw error;
      }
    });
  }

  async listRecipes() {
    const recipes = await this.prisma.recipe.findMany({
      include: recipeInclude,
      orderBy: { updatedAt: "desc" },
    });
    return recipes.map(recipeResponse);
  }

  async getRecipe(productId: string) {
    const recipe = await this.prisma.recipe.findUnique({
      where: { productId },
      include: recipeInclude,
    });
    if (!recipe) throw new NotFoundException("Recipe not found for product");
    return recipeResponse(recipe);
  }

  upsertRecipe(actor: AuthUser, productId: string, dto: UpsertRecipeDto) {
    return this.configurationTransaction(async (tx) => {
      if (
        !(await tx.product.findUnique({
          where: { id: productId },
          select: { id: true },
        }))
      )
        throw new NotFoundException("Product not found");
      const ingredientIds = dto.ingredients.map(
        ({ ingredientId }) => ingredientId,
      );
      validateRecipeIngredientIds(ingredientIds, dto.ingredients.length > 0);
      const ingredients = await tx.ingredient.findMany({
        where: { id: { in: ingredientIds }, isActive: true },
        select: { id: true },
      });
      if (ingredients.length !== ingredientIds.length)
        throw new BadRequestException(
          "Recipe contains an unknown or inactive ingredient",
        );
      const previousRecipe = await tx.recipe.findUnique({
        where: { productId },
        include: recipeInclude,
      });
      const recipe = await tx.recipe.upsert({
        where: { productId },
        create: {
          productId,
          yieldQuantity: dto.yieldQuantity,
          isActive: dto.isActive ?? true,
          ingredients: {
            create: dto.ingredients.map((line) => ({
              ingredientId: line.ingredientId,
              quantity: line.quantity,
            })),
          },
        },
        update: {
          yieldQuantity: dto.yieldQuantity,
          isActive: dto.isActive ?? true,
          ingredients: {
            deleteMany: {},
            create: dto.ingredients.map((line) => ({
              ingredientId: line.ingredientId,
              quantity: line.quantity,
            })),
          },
        },
        include: recipeInclude,
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "inventory.recipe.upserted",
          entityType: "Recipe",
          entityId: recipe.id,
          metadata: {
            productId,
            before: previousRecipe ? recipeAudit(previousRecipe) : null,
            after: recipeAudit(recipe),
          },
        },
      });
      return recipeResponse(recipe);
    });
  }

  async listStock(query: InventoryStockQueryDto) {
    const [branches, ingredients, stocks] = await Promise.all([
      this.prisma.branch.findMany({
        where: query.branchId ? { id: query.branchId } : { isActive: true },
        orderBy: { name: "asc" },
      }),
      this.prisma.ingredient.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
      }),
      this.prisma.ingredientStock.findMany({
        where: query.branchId ? { branchId: query.branchId } : undefined,
      }),
    ]);
    const stockByKey = new Map(
      stocks.map((stock) => [`${stock.branchId}:${stock.ingredientId}`, stock]),
    );
    return branches.flatMap((branch) =>
      ingredients.map((ingredient) => {
        const stock = stockByKey.get(`${branch.id}:${ingredient.id}`);
        const quantity = stock ? Number(stock.quantity) : 0;
        const reorderPoint = Number(ingredient.reorderPoint);
        return {
          id: stock?.id ?? `${branch.id}:${ingredient.id}`,
          ingredientId: ingredient.id,
          ingredientName: ingredient.name,
          unit: ingredient.unit,
          branchId: branch.id,
          branchName: branch.name,
          quantity,
          reorderPoint,
          status: getStockStatus(quantity, reorderPoint),
          updatedAt: stock?.updatedAt ?? null,
        };
      }),
    );
  }

  async listAlerts(query: InventoryStockQueryDto) {
    return (await this.listStock(query))
      .filter((item) => item.status !== "IN_STOCK")
      .map((item) => ({
        ...item,
        missingQuantity: Math.max(0, item.reorderPoint - item.quantity),
      }));
  }

  async listMovements(query: InventoryMovementQueryDto) {
    const movements = await this.prisma.inventoryMovement.findMany({
      where: {
        ...(query.branchId ? { branchId: query.branchId } : {}),
        quantityDelta: { lt: 0 },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit ?? 20,
      include: {
        ingredient: { select: { name: true, unit: true } },
        branch: { select: { name: true } },
        order: { select: { number: true } },
      },
    });
    return movements.map(({ ingredient, branch, order, ...movement }) => ({
      id: movement.id,
      ingredientId: movement.ingredientId,
      branchId: movement.branchId,
      orderId: movement.orderId,
      type: movement.type,
      reason: movement.reason,
      createdAt: movement.createdAt,
      ingredientName: ingredient.name,
      unit: ingredient.unit,
      branchName: branch.name,
      orderNumber: order?.number ?? null,
      quantityDelta: Number(movement.quantityDelta),
      quantityAfter: Number(movement.quantityAfter),
    }));
  }

  // Atomic increment + range predicate holds the stock row lock until commit.
  // Both manual and order consumption share this path, avoiding lost updates.
  private async changeStock(
    tx: Prisma.TransactionClient,
    ingredientId: string,
    branchId: string,
    delta: Prisma.Decimal,
    name: string,
  ) {
    await tx.ingredientStock.createMany({
      data: [{ ingredientId, branchId, quantity: 0 }],
      skipDuplicates: true,
    });
    const changed = await tx.ingredientStock.updateMany({
      where: {
        ingredientId,
        branchId,
        quantity: delta.isNegative()
          ? { gte: delta.negated() }
          : { lte: new Prisma.Decimal("999999999.999").minus(delta) },
      },
      data: { quantity: { increment: delta } },
    });
    if (changed.count !== 1)
      throw new ConflictException(
        `Недостаточный или слишком большой остаток: ${name}. Обновите склад и повторите операцию.`,
      );
    return tx.ingredientStock.findUniqueOrThrow({
      where: { ingredientId_branchId: { ingredientId, branchId } },
    });
  }

  private async orderRequirements(
    tx: Prisma.TransactionClient,
    portions: Map<string, number>,
  ) {
    const recipes = await tx.recipe.findMany({
      where: { productId: { in: [...portions.keys()] }, isActive: true },
      include: { ingredients: { include: { ingredient: true } } },
    });
    const requirements = new Map<string, Prisma.Decimal>();
    for (const recipe of recipes) {
      for (const line of recipe.ingredients) {
        if (!line.ingredient.isActive)
          throw new ConflictException(
            `Ингредиент «${line.ingredient.name}» выключен. Обновите рецептуру.`,
          );
        const amount = line.quantity
          .mul(portions.get(recipe.productId)!)
          .div(recipe.yieldQuantity);
        requirements.set(
          line.ingredientId,
          (requirements.get(line.ingredientId) ?? new Prisma.Decimal(0)).plus(
            amount,
          ),
        );
      }
    }
    return new Map(
      [...requirements].map(([id, amount]) => [
        id,
        amount.toDecimalPlaces(3, Prisma.Decimal.ROUND_UP),
      ]),
    );
  }

  private async orderBalance(tx: Prisma.TransactionClient, orderId: string) {
    const balances = await tx.inventoryMovement.groupBy({
      by: ["ingredientId", "branchId"],
      where: { orderId },
      _sum: { quantityDelta: true },
    });
    return balances.map((balance) => ({
      ingredientId: balance.ingredientId,
      branchId: balance.branchId,
      delta: (balance._sum.quantityDelta ?? new Prisma.Decimal(0)).negated(),
    }));
  }

  private async applyOrderDeltas(
    tx: Prisma.TransactionClient,
    actorId: string,
    order: { id: string; number: number },
    deltas: Array<{
      ingredientId: string;
      branchId: string;
      delta: Prisma.Decimal;
    }>,
    reason: string,
  ) {
    // Collapse all returns and new allocations, then lock stock in stable order.
    const changes = new Map<string, (typeof deltas)[number]>();
    for (const item of deltas) {
      const key = `${item.branchId}:${item.ingredientId}`;
      const previous = changes.get(key);
      changes.set(key, {
        ...item,
        delta: item.delta.plus(previous?.delta ?? 0),
      });
    }
    const movementAudit: Prisma.InputJsonObject[] = [];
    for (const [, item] of [...changes].sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      if (item.delta.isZero()) continue;
      const ingredient = await tx.ingredient.findUniqueOrThrow({
        where: { id: item.ingredientId },
      });
      const stock = await this.changeStock(
        tx,
        item.ingredientId,
        item.branchId,
        item.delta,
        ingredient.name,
      );
      const movement = await tx.inventoryMovement.create({
        data: {
          ingredientId: item.ingredientId,
          branchId: item.branchId,
          actorId,
          orderId: order.id,
          type: item.delta.isNegative()
            ? InventoryMovementType.CONSUMPTION
            : InventoryMovementType.ADJUSTMENT,
          quantityDelta: item.delta,
          quantityAfter: stock.quantity,
          reason: `${reason} · заказ №${order.number}`,
        },
      });
      movementAudit.push({
        movementId: movement.id,
        ingredientId: item.ingredientId,
        branchId: item.branchId,
        unit: ingredient.unit,
        quantityDelta: item.delta.toString(),
        quantityBefore: stock.quantity.minus(item.delta).toString(),
        quantityAfter: stock.quantity.toString(),
      });
    }
    await tx.auditLog.create({
      data: {
        actorId,
        action: "inventory.order.adjusted",
        entityType: "Order",
        entityId: order.id,
        metadata: {
          reason,
          movements: movementAudit,
          stockChanges: [...changes.values()].filter(
            (item) => !item.delta.isZero(),
          ).length,
        },
      },
    });
  }

  async allocateOrder(
    tx: Prisma.TransactionClient,
    actor: { id: string },
    order: {
      id: string;
      number: number;
      branchId: string | null;
      items: Array<{ productId: string; quantity: number }>;
    },
    replaceReservation = false,
  ) {
    // Caller owns the order's creation or optimistic version lock. Only orders
    // created with inventory enabled participate; do not backfill legacy orders.
    if (
      replaceReservation &&
      !(await tx.inventoryAllocatedProduct.findFirst({
        where: { orderId: order.id },
      }))
    )
      return;
    const quantities = new Map<string, number>();
    for (const item of order.items)
      quantities.set(
        item.productId,
        (quantities.get(item.productId) ?? 0) + item.quantity,
      );
    const allocated = replaceReservation
      ? []
      : await tx.inventoryAllocatedProduct.findMany({
          where: { orderId: order.id },
        });
    const previous = new Map(
      allocated.map((item) => [item.productId, item.quantity]),
    );
    const additions = new Map(
      [...quantities]
        .filter(([id, quantity]) => quantity > (previous.get(id) ?? 0))
        .map(([id, quantity]) => [id, quantity - (previous.get(id) ?? 0)]),
    );
    if (!additions.size && !replaceReservation) return;
    const requirements = await this.orderRequirements(tx, additions);
    if (requirements.size && !order.branchId)
      throw new ConflictException(
        "Укажите филиал заказа перед резервированием ингредиентов.",
      );
    const deltas = replaceReservation
      ? await this.orderBalance(tx, order.id)
      : [];
    for (const [ingredientId, quantity] of requirements)
      deltas.push({
        ingredientId,
        branchId: order.branchId!,
        delta: quantity.negated(),
      });
    await this.applyOrderDeltas(
      tx,
      actor.id,
      order,
      deltas,
      replaceReservation ? "Изменение резерва" : "Резерв ингредиентов",
    );
    if (replaceReservation)
      await tx.inventoryAllocatedProduct.deleteMany({
        where: { orderId: order.id },
      });
    for (const [productId] of additions) {
      const quantity = quantities.get(productId)!;
      await tx.inventoryAllocatedProduct.upsert({
        where: { orderId_productId: { orderId: order.id, productId } },
        create: { orderId: order.id, productId, quantity },
        update: { quantity },
      });
    }
  }

  async releaseOrderReservation(
    tx: Prisma.TransactionClient,
    actor: { id: string },
    order: { id: string; number: number },
  ) {
    await this.applyOrderDeltas(
      tx,
      actor.id,
      order,
      await this.orderBalance(tx, order.id),
      "Возврат резерва при отмене до передачи курьеру",
    );
  }

  async adjustStock(
    actor: AuthUser,
    ingredientId: string,
    dto: AdjustInventoryStockDto,
  ) {
    const replay = () => this.replayAdjustment(actor, ingredientId, dto);
    if (dto.idempotencyKey) {
      const existing = await replay();
      if (existing) return existing;
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const type = dto.type ?? InventoryMovementType.ADJUSTMENT;
        validateStockMovement(type, dto.quantityDelta);
        const [ingredient, branch] = await Promise.all([
          tx.ingredient.findUnique({ where: { id: ingredientId } }),
          tx.branch.findUnique({ where: { id: dto.branchId } }),
        ]);
        if (!ingredient) throw new NotFoundException("Ingredient not found");
        if (!branch) throw new NotFoundException("Branch not found");
        const stock = await this.changeStock(
          tx,
          ingredientId,
          dto.branchId,
          new Prisma.Decimal(dto.quantityDelta),
          ingredient.name,
        );
        const nextQuantity = Number(stock.quantity);
        const movement = await tx.inventoryMovement.create({
          data: {
            ingredientId,
            branchId: dto.branchId,
            actorId: actor.id,
            type,
            quantityDelta: dto.quantityDelta,
            quantityAfter: nextQuantity,
            idempotencyKey: dto.idempotencyKey,
            reason: dto.reason?.trim() || null,
          },
        });
        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            action: "inventory.stock.adjusted",
            entityType: "IngredientStock",
            entityId: stock.id,
            metadata: {
              ingredientId,
              branchId: dto.branchId,
              movementId: movement.id,
              quantityDelta: dto.quantityDelta,
              quantityBefore: stock.quantity
                .minus(dto.quantityDelta)
                .toString(),
              quantityAfter: stock.quantity.toString(),
              unit: ingredient.unit,
              type,
              reason: dto.reason?.trim() || null,
              idempotencyKey: dto.idempotencyKey ?? null,
            },
          },
        });
        return {
          ...stock,
          ingredientName: ingredient.name,
          unit: ingredient.unit,
          branchName: branch.name,
          quantity: Number(stock.quantity),
          reorderPoint: Number(ingredient.reorderPoint),
          status: getStockStatus(
            Number(stock.quantity),
            Number(ingredient.reorderPoint),
          ),
          updatedAt: stock.updatedAt,
        };
      });
    } catch (error) {
      if (dto.idempotencyKey) {
        const existing = await replay();
        if (existing) return existing;
      }
      throw error;
    }
  }

  private async replayAdjustment(
    actor: AuthUser,
    ingredientId: string,
    dto: AdjustInventoryStockDto,
  ) {
    if (!dto.idempotencyKey) return null;
    const movement = await this.prisma.inventoryMovement.findUnique({
      where: {
        actorId_idempotencyKey: {
          actorId: actor.id,
          idempotencyKey: dto.idempotencyKey,
        },
      },
    });
    if (!movement) return null;
    if (
      movement.ingredientId !== ingredientId ||
      movement.branchId !== dto.branchId ||
      movement.type !== (dto.type ?? InventoryMovementType.ADJUSTMENT) ||
      !movement.quantityDelta.equals(dto.quantityDelta) ||
      movement.reason !== (dto.reason?.trim() || null)
    )
      throw new ConflictException(
        "Ключ операции уже использован с другими данными. Обновите склад.",
      );
    const stock = await this.prisma.ingredientStock.findUniqueOrThrow({
      where: {
        ingredientId_branchId: { ingredientId, branchId: dto.branchId },
      },
      include: { ingredient: true, branch: true },
    });
    return {
      id: stock.id,
      ingredientId,
      branchId: stock.branchId,
      ingredientName: stock.ingredient.name,
      unit: stock.ingredient.unit,
      branchName: stock.branch.name,
      quantity: Number(stock.quantity),
      reorderPoint: Number(stock.ingredient.reorderPoint),
      status: getStockStatus(
        Number(stock.quantity),
        Number(stock.ingredient.reorderPoint),
      ),
      updatedAt: stock.updatedAt,
    };
  }
}
