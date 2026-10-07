import "reflect-metadata";
import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import request from "supertest";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { parseDistancePriceTiers } from "../src/delivery/distance-price-tiers";
import {
  Role,
  type DeliverySettings,
  type User,
} from "../src/generated/prisma/client";
import { GeocodingService } from "../src/geocoding/geocoding.service";
import type { OrderResponseDto } from "../src/orders/orders-response.dto";
import { PrismaService } from "../src/prisma/prisma.service";

const inside = { latitude: 37.95, longitude: 58.38 };
const outside = { latitude: 37.6, longitude: 61.83 };
const reverseGeocode = vi.fn(() => Promise.resolve("Ашхабад"));

describe("delivery service area HTTP enforcement", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: Parameters<typeof request>[0];
  let original: DeliverySettings;
  let productId: string;
  let branchId: string;
  let etrapId: number;
  const users = new Map<Role, User>();
  const tokens = new Map<Role, string>();
  const auth = (role = Role.CUSTOMER) => ({
    Authorization: `Bearer ${tokens.get(role)}`,
  });
  const orderBody = (extra: Record<string, unknown> = {}) => ({
    items: [{ productId, quantity: 1 }],
    address: "Delivery test",
    ...inside,
    ...extra,
  });
  const customer = () => users.get(Role.CUSTOMER)!;
  const orders = () =>
    prisma.order.count({ where: { customerId: customer().id } });
  const printTasks = () =>
    prisma.receiptPrintTask.count({
      where: { order: { customerId: customer().id } },
    });

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GeocodingService)
      .useValue({ reverseGeocode })
      .compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as Parameters<typeof request>[0];
    prisma = app.get(PrismaService);
    original = await prisma.deliverySettings.findUniqueOrThrow({
      where: { id: "default" },
    });
    const jwt = app.get(JwtService);
    for (const [i, role] of Object.values(Role).entries()) {
      const user = await prisma.user.create({
        data: { phone: `+9936100880${i}`, role, pointsBalance: 100 },
      });
      users.set(role, user);
      tokens.set(
        role,
        await jwt.signAsync({ sub: user.id, phone: user.phone, role }),
      );
    }
    branchId = (
      await prisma.branch.create({
        data: { name: "Service area test branch", address: "Test", ...inside },
      })
    ).id;
    productId = (
      await prisma.product.create({
        data: {
          name: "Service area test dish",
          slug: `area-${randomUUID()}`,
          description: "Test",
          price: 20,
          category: {
            create: {
              name: "Service area test category",
              slug: `area-${randomUUID()}`,
            },
          },
        },
      })
    ).id;
    etrapId = (
      await prisma.etrap.create({
        data: {
          nameRu: "Service area test tariff",
          nameTk: "Service area test tariff",
          price: 15,
          nightPrice: 15,
          isDeliveryEnabled: true,
          deliveryZone: [
            { latitude: 37.94, longitude: 58.37 },
            { latitude: 37.94, longitude: 58.39 },
            { latitude: 37.96, longitude: 58.39 },
            { latitude: 37.96, longitude: 58.37 },
          ],
          welayatId: 1,
        },
      })
    ).id;
  });

  beforeEach(async () => {
    reverseGeocode.mockClear();
    await prisma.deliverySettings.update({
      where: { id: "default" },
      data: {
        mapPricingEnabled: false,
        distancePricingEnabled: false,
        nightTariffEnabled: false,
        dayPricePerKilometer: 5,
        nightPricePerKilometer: 8,
      },
    });
  });

  afterAll(async () => {
    try {
      if (prisma && original) {
        const { id, distancePriceTiers, ...rest } = original;
        await prisma.deliverySettings.update({
          where: { id },
          data: {
            ...rest,
            distancePriceTiers: parseDistancePriceTiers(distancePriceTiers),
          },
        });
        await prisma.branch.update({
          where: { id: branchId },
          data: { isActive: false },
        });
        await prisma.product.update({
          where: { id: productId },
          data: { isActive: false },
        });
        await prisma.etrap.update({
          where: { id: etrapId },
          data: { isDeliveryEnabled: false },
        });
        await prisma.user.updateMany({
          where: { id: { in: [...users.values()].map(({ id }) => id) } },
          data: { isActive: false },
        });
      }
    } finally {
      await app?.close();
    }
  });

  it.each(["legacy", "map", "distance"])(
    "rejects outside coordinates in every quote and creation path with %s pricing",
    async (mode) => {
      await prisma.deliverySettings.update({
        where: { id: "default" },
        data: {
          mapPricingEnabled: mode === "map",
          distancePricingEnabled: mode === "distance",
        },
      });
      const previous = { orders: await orders(), tasks: await printTasks() };
      for (const path of [
        "delivery/quote",
        "delivery/tariff-quote",
        "orders/quote",
        "orders",
      ]) {
        const payload = path.startsWith("delivery")
          ? {
              ...outside,
              subtotal: 20,
              ...(path.endsWith("tariff-quote")
                ? { deliveryEtrapId: etrapId }
                : {}),
            }
          : path === "orders/quote"
            ? { ...outside, items: orderBody().items, deliveryEtrapId: etrapId }
            : orderBody({
                ...outside,
                deliveryEtrapId: etrapId,
                idempotencyKey: randomUUID(),
              });
        const response = await request(server)
          .post(`/api/v1/${path}`)
          .set(auth())
          .send(payload)
          .expect(400);
        expect(response.body).toMatchObject({
          code: "OUTSIDE_DELIVERY_AREA",
          statusCode: 400,
        });
      }
      expect(reverseGeocode).not.toHaveBeenCalled();
      expect(await orders()).toBe(previous.orders);
      expect(await printTasks()).toBe(previous.tasks);
    },
  );

  it.each(Object.values(Role))(
    "does not grant %s a geographic bypass for personal orders",
    async (role) => {
      const response = await request(server)
        .post("/api/v1/orders")
        .set(auth(role))
        .send(orderBody(outside))
        .expect(400);
      expect(response.body).toMatchObject({ code: "OUTSIDE_DELIVERY_AREA" });
    },
  );

  it.each(["map", "distance"])(
    "ignores a stale district ID in %s pricing while still enforcing coverage",
    async (mode) => {
      await prisma.deliverySettings.update({
        where: { id: "default" },
        data: {
          mapPricingEnabled: mode === "map",
          distancePricingEnabled: mode === "distance",
        },
      });
      const accepted = await request(server)
        .post("/api/v1/orders")
        .set(auth())
        .send(orderBody({ deliveryEtrapId: 999_999 }))
        .expect(201);
      expect(accepted.body).toMatchObject({
        ...inside,
        deliveryEtrapId: mode === "map" ? etrapId : null,
      });
      const rejected = await request(server)
        .post("/api/v1/orders")
        .set(auth())
        .send(orderBody({ ...outside, deliveryEtrapId: 999_999 }))
        .expect(400);
      expect(rejected.body).toMatchObject({ code: "OUTSIDE_DELIVERY_AREA" });
    },
  );

  it.each([inside, { latitude: 37.89, longitude: 58.51 }])(
    "creates an inside order normally at $latitude/$longitude",
    async (coordinates) => {
      const response = await request(server)
        .post("/api/v1/orders")
        .set(auth())
        .send(orderBody(coordinates))
        .expect(201);
      expect(response.body).toMatchObject({
        ...coordinates,
        status: "COOKING",
      });
      const created = response.body as OrderResponseDto;
      expect(
        await prisma.receiptPrintTask.count({ where: { orderId: created.id } }),
      ).toBeGreaterThan(0);
    },
  );

  it("rechecks saved/default addresses and rolls back activation and address audit", async () => {
    await prisma.userAddress.updateMany({
      where: { userId: customer().id },
      data: { isActive: false },
    });
    const home = await prisma.userAddress.create({
      data: {
        userId: customer().id,
        address: "Home",
        ...inside,
        isActive: true,
      },
    });
    const remote = await prisma.userAddress.create({
      data: {
        userId: customer().id,
        address: "Mary",
        ...outside,
        isActive: false,
      },
    });
    const previous = { orders: await orders(), tasks: await printTasks() };
    const response = await request(server)
      .post("/api/v1/orders")
      .set(auth())
      .send({
        items: orderBody().items,
        addressId: remote.id,
        deliveryEtrapId: etrapId,
      })
      .expect(400);
    expect(response.body).toMatchObject({ code: "OUTSIDE_DELIVERY_AREA" });
    expect(
      await prisma.userAddress.findUniqueOrThrow({ where: { id: home.id } }),
    ).toMatchObject({ isActive: true });
    expect(
      await prisma.userAddress.findUniqueOrThrow({ where: { id: remote.id } }),
    ).toMatchObject({
      isActive: false,
      lastUsedAt: null,
      deliveryEtrapId: null,
    });
    expect(
      await prisma.auditLog.count({
        where: { entityId: remote.id, action: "address.used_for_order" },
      }),
    ).toBe(0);
    await prisma.userAddress.updateMany({
      where: { userId: customer().id },
      data: { isActive: false },
    });
    await prisma.userAddress.update({
      where: { id: remote.id },
      data: { isActive: true },
    });
    const fallback = await request(server)
      .post("/api/v1/orders")
      .set(auth())
      .send({ items: orderBody().items, latitude: null, longitude: null })
      .expect(400);
    expect(fallback.body).toMatchObject({ code: "OUTSIDE_DELIVERY_AREA" });
    expect(await orders()).toBe(previous.orders);
    expect(await printTasks()).toBe(previous.tasks);
  });

  it("does not consume promos, gifts, points, inventory or idempotency keys after rejection", async () => {
    const promo = await prisma.promoCode.create({
      data: {
        code: `AREA${randomUUID().replaceAll("-", "").slice(0, 10)}`.toUpperCase(),
        type: "FIXED",
        value: 1,
        totalUsageLimit: 1,
      },
    });
    const gift = await prisma.gift.create({
      data: {
        name: "Area gift",
        description: "Test",
        imageUrl: "/api/v1/media/test.webp",
        pointsCost: 10,
        stock: 1,
      },
    });
    const beforeAddresses = await prisma.userAddress.count({
      where: { userId: customer().id },
    });
    const previous = { orders: await orders(), tasks: await printTasks() };
    const key = randomUUID();
    const payload = orderBody({
      ...outside,
      promoCode: promo.code,
      gifts: [{ giftId: gift.id, quantity: 1 }],
      idempotencyKey: key,
    });
    const attempts = await Promise.all([
      request(server).post("/api/v1/orders").set(auth()).send(payload),
      request(server).post("/api/v1/orders").set(auth()).send(payload),
    ]);
    expect(attempts.map(({ status }) => status)).toEqual([400, 400]);
    for (const attempt of attempts) {
      expect(attempt.body).toMatchObject({ code: "OUTSIDE_DELIVERY_AREA" });
    }
    expect(
      await prisma.promoCode.findUniqueOrThrow({ where: { id: promo.id } }),
    ).toMatchObject({ usedCount: 0 });
    expect(
      await prisma.gift.findUniqueOrThrow({ where: { id: gift.id } }),
    ).toMatchObject({ stock: 1 });
    expect(
      await prisma.user.findUniqueOrThrow({ where: { id: customer().id } }),
    ).toMatchObject({ pointsBalance: 100 });
    expect(
      await prisma.promoRedemption.count({ where: { promoCodeId: promo.id } }),
    ).toBe(0);
    expect(
      await prisma.inventoryMovement.count({
        where: { actorId: customer().id, order: { customerId: customer().id } },
      }),
    ).toBe(0);
    expect(
      await prisma.orderCreationRequest.count({
        where: { actorId: customer().id, key },
      }),
    ).toBe(0);
    expect(
      await prisma.userAddress.count({ where: { userId: customer().id } }),
    ).toBe(beforeAddresses);
    expect(await orders()).toBe(previous.orders);
    expect(await printTasks()).toBe(previous.tasks);
    // A rejected attempt has not consumed the key; a corrected address can create once.
    const corrected = await request(server)
      .post("/api/v1/orders")
      .set(auth())
      .send({ ...payload, ...inside })
      .expect(201);
    const retry = await request(server)
      .post("/api/v1/orders")
      .set(auth())
      .send({ ...payload, ...inside })
      .expect(201);
    expect(retry.body).toMatchObject({
      id: (corrected.body as OrderResponseDto).id,
    });
  });

  it.each([Role.OPERATOR, Role.ADMIN, Role.SUPER_ADMIN])(
    "rejects an outside phone order from %s even with a manual fee",
    async (role) => {
      const previous = { orders: await orders(), tasks: await printTasks() };
      const response = await request(server)
        .post("/api/v1/orders/assisted")
        .set(auth(role))
        .send(
          orderBody({
            ...outside,
            customerPhone: customer().phone,
            manualDeliveryFee: 0,
            manualDeliveryReason: "Цена согласована по телефону",
          }),
        )
        .expect(400);
      expect(response.body).toMatchObject({ code: "OUTSIDE_DELIVERY_AREA" });
      expect(await orders()).toBe(previous.orders);
      expect(await printTasks()).toBe(previous.tasks);
    },
  );

  it("rejects ordinary text-only orders and preserves trusted manual phone orders", async () => {
    const manual = {
      items: orderBody().items,
      address: "Ашхабад, дом 7",
      addressLocationStatus: "MANUAL_UNVERIFIED",
    };
    const response = await request(server)
      .post("/api/v1/orders")
      .set(auth())
      .send(manual)
      .expect(400);
    expect(response.body).toMatchObject({ code: "DELIVERY_LOCATION_REQUIRED" });
    for (const role of [Role.OPERATOR, Role.ADMIN, Role.SUPER_ADMIN]) {
      const accepted = await request(server)
        .post("/api/v1/orders/assisted")
        .set(auth(role))
        .send({ ...manual, customerPhone: customer().phone })
        .expect(201);
      expect(accepted.body).toMatchObject({
        source: "STAFF_PHONE",
        latitude: null,
        longitude: null,
        addressLocationStatus: "MANUAL_UNVERIFIED",
      });
    }
    for (const role of [
      Role.CUSTOMER,
      Role.COOK,
      Role.COURIER,
      Role.ACCOUNTANT,
    ]) {
      await request(server)
        .post("/api/v1/orders/assisted")
        .set(auth(role))
        .send({ ...manual, customerPhone: customer().phone })
        .expect(403);
    }
  });

  it("rolls back a new caller account when a phone order is outside coverage", async () => {
    const phone = "+99361008990";
    expect(await prisma.user.findUnique({ where: { phone } })).toBeNull();
    const response = await request(server)
      .post("/api/v1/orders/assisted")
      .set(auth(Role.OPERATOR))
      .send(orderBody({ ...outside, customerPhone: phone }))
      .expect(400);
    expect(response.body).toMatchObject({ code: "OUTSIDE_DELIVERY_AREA" });
    expect(await prisma.user.findUnique({ where: { phone } })).toBeNull();
  });

  it("checks administrator edits without changing old orders or receipts", async () => {
    const created = (
      await request(server)
        .post("/api/v1/orders")
        .set(auth())
        .send(orderBody())
        .expect(201)
    ).body as OrderResponseDto;
    const before = await prisma.order.findUniqueOrThrow({
      where: { id: created.id },
    });
    const tasks = await prisma.receiptPrintTask.findMany({
      where: { orderId: created.id },
    });
    const edit = await request(server)
      .patch(`/api/v1/orders/${created.id}/admin-edit`)
      .set(auth(Role.ADMIN))
      .send(
        orderBody({
          ...outside,
          deliveryEtrapId: etrapId,
          version: created.version,
        }),
      )
      .expect(400);
    expect(edit.body).toMatchObject({ code: "OUTSIDE_DELIVERY_AREA" });
    expect(
      await prisma.order.findUniqueOrThrow({ where: { id: created.id } }),
    ).toEqual(before);
    expect(
      await prisma.receiptPrintTask.findMany({
        where: { orderId: created.id },
      }),
    ).toEqual(tasks);
    expect(
      await prisma.orderTransition.count({ where: { orderId: created.id } }),
    ).toBe(0);
  });

  it("retains coordinate-free price previews without promising service availability", async () => {
    await request(server)
      .post("/api/v1/orders/quote")
      .set(auth())
      .send({ items: orderBody().items })
      .expect(200);
    await request(server)
      .post("/api/v1/delivery/tariff-quote")
      .send({ subtotal: 20 })
      .expect(200);
    await request(server)
      .post("/api/v1/orders")
      .send(orderBody(outside))
      .expect(401);
  });
});
