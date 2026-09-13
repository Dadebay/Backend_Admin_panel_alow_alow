import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { JwtService } from "@nestjs/jwt";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { InventoryMovementType, InventoryUnit, Role } from "../src/generated/prisma/client";
import { PrismaService } from "../src/prisma/prisma.service";

describe("inventory recipe and stock API", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  let server: Parameters<typeof request>[0];
  let adminToken: string;
  let operatorToken: string;
  let cookToken: string;
  let customerToken: string;
  let productId: string;
  let branchId: string;
  let flourId: string;

  type RecipeResponse = {
    productId: string;
    yieldQuantity: number;
    estimatedCost: number;
    ingredients: unknown[];
  };
  type StockResponse = { ingredientId: string; quantity: number; status: string };

  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function createToken(role: Role) {
    const user = await prisma.user.create({
      data: { phone: `+99365${randomUUID().replaceAll("-", "").slice(0, 8)}`, role },
    });
    return jwt.signAsync({ sub: user.id, phone: user.phone, role: user.role });
  }

  async function createIngredient(name: string, unit: InventoryUnit, costPerUnit: number, reorderPoint = 0) {
    const response = await request(server)
      .post("/api/v1/inventory/ingredients")
      .set(bearer(adminToken))
      .send({ name, unit, costPerUnit, reorderPoint })
      .expect(201);
    return (response.body as { id: string }).id;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    jwt = app.get(JwtService);
    server = app.getHttpServer() as Parameters<typeof request>[0];

    adminToken = await createToken(Role.ADMIN);
    operatorToken = await createToken(Role.OPERATOR);
    cookToken = await createToken(Role.COOK);
    customerToken = await createToken(Role.CUSTOMER);

    const category = await prisma.category.create({
      data: { name: `Inventory category ${randomUUID()}`, slug: `inventory-${randomUUID()}` },
    });
    const product = await prisma.product.create({
      data: {
        categoryId: category.id,
        name: `Inventory meal ${randomUUID()}`,
        slug: `inventory-meal-${randomUUID()}`,
        description: "Inventory e2e product",
        price: 50,
      },
    });
    productId = product.id;
    const branch = await prisma.branch.create({
      data: {
        name: `Inventory branch ${randomUUID()}`,
        address: "Inventory test street",
        latitude: 37.95,
        longitude: 58.38,
      },
    });
    branchId = branch.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it("allows operational reads, denies customer reads, and keeps mutations admin-only", async () => {
    await request(server).get("/api/v1/inventory/ingredients").set(bearer(operatorToken)).expect(200);
    await request(server).get("/api/v1/inventory/ingredients").set(bearer(cookToken)).expect(200);
    await request(server).get("/api/v1/inventory/stock").set(bearer(operatorToken)).expect(200);
    await request(server).get("/api/v1/inventory/alerts").set(bearer(cookToken)).expect(200);
    await request(server).get("/api/v1/inventory/ingredients").set(bearer(customerToken)).expect(403);
    await request(server).get("/api/v1/inventory/recipes").expect(401);

    await request(server)
      .post("/api/v1/inventory/ingredients")
      .set(bearer(operatorToken))
      .send({ name: "Forbidden ingredient", unit: InventoryUnit.GRAM, costPerUnit: 1 })
      .expect(403);
    await request(server)
      .post(`/api/v1/inventory/stock/${randomUUID()}/adjust`)
      .set(bearer(operatorToken))
      .send({ branchId, quantityDelta: 1 })
      .expect(403);
  });

  it("validates recipe contents and returns calculated recipe cost", async () => {
    flourId = await createIngredient("Flour", InventoryUnit.GRAM, 0.02, 100);
    const waterId = await createIngredient("Water", InventoryUnit.MILLILITER, 0.001, 50);
    await request(server)
      .post("/api/v1/inventory/ingredients")
      .set(bearer(adminToken))
      .send({ name: "Invalid unit", unit: "KILOGRAM", costPerUnit: 1 })
      .expect(400);
    await request(server)
      .post("/api/v1/inventory/ingredients")
      .set(bearer(adminToken))
      .send({ name: "Negative price", unit: InventoryUnit.GRAM, costPerUnit: -1 })
      .expect(400);

    await request(server)
      .put(`/api/v1/inventory/recipes/${productId}`)
      .set(bearer(adminToken))
      .send({ yieldQuantity: 1, ingredients: [] })
      .expect(400);
    await request(server)
      .put(`/api/v1/inventory/recipes/${productId}`)
      .set(bearer(adminToken))
      .send({ yieldQuantity: 0, ingredients: [{ ingredientId: flourId, quantity: 100 }] })
      .expect(400);
    await request(server)
      .put(`/api/v1/inventory/recipes/${productId}`)
      .set(bearer(adminToken))
      .send({ yieldQuantity: 1, ingredients: [{ ingredientId: flourId, quantity: 100 }, { ingredientId: flourId, quantity: 50 }] })
      .expect(400);
    await request(server)
      .put(`/api/v1/inventory/recipes/${productId}`)
      .set(bearer(adminToken))
      .send({ yieldQuantity: 1, ingredients: [{ ingredientId: randomUUID(), quantity: 100 }] })
      .expect(400);

    const saved = await request(server)
      .put(`/api/v1/inventory/recipes/${productId}`)
      .set(bearer(adminToken))
      .send({ yieldQuantity: 2, ingredients: [{ ingredientId: flourId, quantity: 100 }, { ingredientId: waterId, quantity: 50 }] })
      .expect(200);
    const savedBody = saved.body as RecipeResponse;
    expect(savedBody).toMatchObject({ productId, yieldQuantity: 2, estimatedCost: 2.05 });
    expect(savedBody.ingredients).toHaveLength(2);

    await request(server)
      .put(`/api/v1/inventory/recipes/${productId}`)
      .set(bearer(adminToken))
      .send({ yieldQuantity: 1, isActive: true, ingredients: [{ ingredientId: flourId, quantity: 100 }], unexpected: true })
      .expect(400);
    await request(server).get(`/api/v1/inventory/recipes/${randomUUID()}`).set(bearer(operatorToken)).expect(404);
  });

  it("tracks stock, alerts at the threshold, and rejects invalid movements", async () => {
    await request(server)
      .post(`/api/v1/inventory/stock/${flourId}/adjust`)
      .set(bearer(adminToken))
      .send({ branchId, quantityDelta: 100, type: InventoryMovementType.RECEIPT, reason: "Initial receipt" })
      .expect(201);

    const stock = await request(server).get(`/api/v1/inventory/stock?branchId=${branchId}`).set(bearer(operatorToken)).expect(200);
    const stockItems = stock.body as StockResponse[];
    expect(stockItems.find((item) => item.ingredientId === flourId)).toMatchObject({ quantity: 100, status: "LOW_STOCK" });
    const alerts = await request(server).get(`/api/v1/inventory/alerts?branchId=${branchId}`).set(bearer(cookToken)).expect(200);
    const alertItems = alerts.body as StockResponse[];
    expect(alertItems.some((item) => item.ingredientId === flourId)).toBe(true);

    await request(server).post(`/api/v1/inventory/stock/${flourId}/adjust`).set(bearer(adminToken)).send({ branchId, quantityDelta: 0 }).expect(400);
    await request(server).post(`/api/v1/inventory/stock/${flourId}/adjust`).set(bearer(adminToken)).send({ branchId, quantityDelta: -1, type: InventoryMovementType.RECEIPT }).expect(400);
    await request(server).post(`/api/v1/inventory/stock/${flourId}/adjust`).set(bearer(adminToken)).send({ branchId, quantityDelta: 1, type: InventoryMovementType.WASTE }).expect(400);
    await request(server).post(`/api/v1/inventory/stock/${flourId}/adjust`).set(bearer(adminToken)).send({ branchId, quantityDelta: -101, type: InventoryMovementType.WASTE }).expect(409);
    await request(server).post(`/api/v1/inventory/stock/${randomUUID()}/adjust`).set(bearer(adminToken)).send({ branchId, quantityDelta: 1 }).expect(404);

    await request(server).patch(`/api/v1/inventory/ingredients/${flourId}`).set(bearer(adminToken)).send({ unit: InventoryUnit.PIECE }).expect(409);
    const movementCount = await prisma.inventoryMovement.count({ where: { ingredientId: flourId, branchId } });
    expect(movementCount).toBe(1);
  });
});
