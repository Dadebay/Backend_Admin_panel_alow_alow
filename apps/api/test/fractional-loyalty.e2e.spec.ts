import "reflect-metadata";
import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { OrderStatus, Role } from "../src/generated/prisma/client";
import { PrismaService } from "../src/prisma/prisma.service";
import type { CatalogAdminProductResponseDto } from "../src/catalog/catalog-response.dto";
import type { OrderResponseDto } from "../src/orders/orders-response.dto";

describe("fractional per-dish loyalty points HTTP", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: Parameters<typeof request>[0];
  let categoryId: string;
  let branchId: string;
  let customerId: string;
  const tokens = new Map<Role, string>();
  const userIds: string[] = [];
  const auth = (role: Role) => ({ Authorization: `Bearer ${tokens.get(role)}` });
  const productBody = (loyaltyPoints: number) => ({ categoryId, name: "Fractional dish", description: "Test", price: 10, loyaltyPoints });

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as Parameters<typeof request>[0];
    prisma = app.get(PrismaService);
    for (const role of Object.values(Role)) {
      const user = await prisma.user.create({ data: { phone: `+993620077${String(userIds.length).padStart(2, "0")}`, role } });
      userIds.push(user.id);
      tokens.set(role, await app.get(JwtService).signAsync({ sub: user.id, phone: user.phone, role }));
      if (role === Role.CUSTOMER) customerId = user.id;
    }
    categoryId = (await prisma.category.create({ data: { name: "Fractional points", slug: `fractional-${randomUUID()}` } })).id;
    branchId = (await prisma.branch.create({ data: { name: "Fractional points branch", address: "Test", latitude: 37.95, longitude: 58.38 } })).id;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.branch.update({ where: { id: branchId }, data: { isActive: false } });
      await prisma.user.updateMany({ where: { id: { in: userIds } }, data: { isActive: false } });
    }
    await app?.close();
  });

  it.each([Role.ADMIN, Role.SUPER_ADMIN])("allows %s to create, read and edit fractional points", async (role) => {
    const created = await request(server).post("/api/v1/catalog/products").set(auth(role)).send(productBody(0.65)).expect(201);
    const product = created.body as CatalogAdminProductResponseDto;
    expect(product.loyaltyPoints).toBe(0.65);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).loyaltyPoints.toString()).toBe("0.65");
    const updated = await request(server).patch(`/api/v1/catalog/products/${product.id}`).set(auth(role)).send({ loyaltyPoints: 0.01 }).expect(200);
    expect((updated.body as CatalogAdminProductResponseDto).loyaltyPoints).toBe(0.01);
    const listed = await request(server).get("/api/v1/catalog/admin/products/page").query({ categoryId }).set(auth(role)).expect(200);
    expect(listed.body).toMatchObject({ items: expect.arrayContaining([expect.objectContaining({ id: product.id, loyaltyPoints: 0.01 })]) as unknown });
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: product.id, action: "catalog.product.updated" } });
    expect(audit.metadata).toMatchObject({ before: { loyaltyPoints: 0.65 }, after: { loyaltyPoints: 0.01 } });
    for (const loyaltyPoints of [0, -0.65, 0.001, 0.655, 100000.01]) {
      await request(server).patch(`/api/v1/catalog/products/${product.id}`).set(auth(role)).send({ loyaltyPoints }).expect(400);
    }
    expect((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).loyaltyPoints.toString()).toBe("0.01");
  });

  it("keeps product mutations deny-by-default for other roles and anonymous requests", async () => {
    const product = await prisma.product.findFirstOrThrow({ where: { categoryId } });
    for (const role of Object.values(Role).filter((role) => role !== Role.ADMIN && role !== Role.SUPER_ADMIN)) {
      await request(server).post("/api/v1/catalog/products").set(auth(role)).send(productBody(0.65)).expect(403);
      await request(server).patch(`/api/v1/catalog/products/${product.id}`).set(auth(role)).send({ loyaltyPoints: 0.65 }).expect(403);
    }
    await request(server).patch(`/api/v1/catalog/products/${product.id}`).send({ loyaltyPoints: 0.65 }).expect(401);
  });

  it("snapshots exact points, recalculates edits, credits once and reverses the same amount", async () => {
    const product = await prisma.product.create({ data: { ...productBody(0.65), slug: `fractional-order-${randomUUID()}` } });
    const welayat = await prisma.welayat.create({ data: { nameRu: "Fractional test", nameTk: "Fractional test" } });
    const etrap = await prisma.etrap.create({ data: { welayatId: welayat.id, nameRu: "Fractional test", nameTk: "Fractional test", queuePosition: 1, price: 15, isDeliveryEnabled: true } });
    const payload = { items: [{ productId: product.id, quantity: 3 }], deliveryEtrapId: etrap.id, address: "Fractional points address", latitude: 37.95, longitude: 58.38 };
    const quote = await request(server).post("/api/v1/orders/quote").set(auth(Role.CUSTOMER)).send({ items: payload.items, latitude: payload.latitude, longitude: payload.longitude }).expect(200);
    expect(quote.body).toMatchObject({ loyaltyPointsEarned: 1.95, items: [expect.objectContaining({ loyaltyPoints: 1.95 })] });
    const key = randomUUID();
    const created = await request(server).post("/api/v1/orders").set(auth(Role.CUSTOMER)).send({ ...payload, idempotencyKey: key }).expect(201);
    let order = created.body as OrderResponseDto;
    expect(order).toMatchObject({ loyaltyPointsEarned: 1.95, items: [expect.objectContaining({ loyaltyPoints: 1.95 })] });
    const repeated = await request(server).post("/api/v1/orders").set(auth(Role.CUSTOMER)).send({ ...payload, idempotencyKey: key }).expect(201);
    expect((repeated.body as OrderResponseDto).id).toBe(order.id);
    const edited = await request(server).patch(`/api/v1/orders/${order.id}/admin-edit`).set(auth(Role.ADMIN)).send({ ...payload, version: order.version, items: [{ productId: product.id, quantity: 7 }] }).expect(200);
    order = edited.body as OrderResponseDto;
    expect(order).toMatchObject({ loyaltyPointsEarned: 4.55, items: [expect.objectContaining({ loyaltyPoints: 4.55 })] });
    // A later catalog edit must not change the order's earned-point snapshot.
    await request(server).patch(`/api/v1/catalog/products/${product.id}`).set(auth(Role.ADMIN)).send({ loyaltyPoints: 9 }).expect(200);
    await prisma.order.update({ where: { id: order.id }, data: { status: OrderStatus.OUT_FOR_DELIVERY, version: { increment: 1 } } });
    const beforeDelivery = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    const delivered = await request(server).patch(`/api/v1/orders/${order.id}/transition`).set(auth(Role.ADMIN)).send({ status: OrderStatus.DELIVERED, version: beforeDelivery.version }).expect(200);
    order = delivered.body as OrderResponseDto;
    await request(server).patch(`/api/v1/orders/${order.id}/transition`).set(auth(Role.ADMIN)).send({ status: OrderStatus.DELIVERED, version: beforeDelivery.version }).expect(409);
    const wallet = await request(server).get("/api/v1/loyalty/me").set(auth(Role.CUSTOMER)).expect(200);
    expect(wallet.body).toMatchObject({ pointsBalance: 4.55, entries: expect.arrayContaining([expect.objectContaining({ orderId: order.id, kind: "EARN", points: 4.55 })]) as unknown });
    const gift = await prisma.gift.create({ data: { name: "Whole-point gift", description: "Test", imageUrl: `/api/v1/media/${randomUUID()}.webp`, pointsCost: 5 } });
    await request(server).post("/api/v1/orders").set(auth(Role.CUSTOMER)).send({ ...payload, gifts: [{ giftId: gift.id, quantity: 1 }] }).expect(409);
    await prisma.gift.update({ where: { id: gift.id }, data: { pointsCost: 3 } });
    const redemption = await request(server).post("/api/v1/orders").set(auth(Role.CUSTOMER)).send({ ...payload, gifts: [{ giftId: gift.id, quantity: 1 }] }).expect(201);
    const redemptionOrder = redemption.body as OrderResponseDto;
    expect((await prisma.user.findUniqueOrThrow({ where: { id: customerId } })).pointsBalance.toNumber()).toBe(1.55);
    await request(server).patch(`/api/v1/orders/${redemptionOrder.id}/cancel`).set(auth(Role.ADMIN)).send({ version: redemptionOrder.version, reason: "Refund keeps fractional balance" }).expect(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: customerId } })).pointsBalance.toNumber()).toBe(4.55);
    await request(server).patch(`/api/v1/orders/${order.id}/cancel`).set(auth(Role.ADMIN)).send({ version: order.version, reason: "Fractional cancellation test" }).expect(200);
    const cancelledWallet = await request(server).get("/api/v1/loyalty/me").set(auth(Role.CUSTOMER)).expect(200);
    expect(cancelledWallet.body).toMatchObject({ pointsBalance: 0, entries: expect.arrayContaining([expect.objectContaining({ orderId: order.id, kind: "REVERSE_EARN", points: -4.55 })]) as unknown });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: customerId } })).pointsBalance.toString()).toBe("0");
  });
});
