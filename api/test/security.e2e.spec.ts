import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { OrderStatus, Role, type User } from "../src/generated/prisma/client";
import { PrismaService } from "../src/prisma/prisma.service";
import { OtpService } from "../src/auth/otp.service";

type TestUsers = Record<
  | "customer"
  | "otherCustomer"
  | "operator"
  | "cook"
  | "otherCook"
  | "courier"
  | "otherCourier"
  | "accountant"
  | "admin"
  | "superAdmin"
  | "inactive",
  User
>;

type SessionResponse = {
  accessToken: string;
  refreshToken: string;
};

type AddressResponse = {
  id: string;
  address: string;
  isActive: boolean;
};

type OrderResponse = {
  id: string;
  status: OrderStatus;
  version: number;
  address: string;
  cashSettlement?: { status: string } | null;
  rating?: { score: number; comment: string | null } | null;
  transitions?: Array<{ toStatus: OrderStatus }>;
};

type CatalogProductResponse = {
  id: string;
  categoryId: string;
  name: string;
  slug: string;
  description: string;
  price: number;
  images: Array<{ url: string; sortOrder: number }>;
};

describe("backend security and critical workflow", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  let otp: OtpService;
  let server: Parameters<typeof request>[0];
  let users: TestUsers;
  let tokens: Record<keyof TestUsers, string>;
  let productId: string;

  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const mediaUrl = (sequence: number) =>
    `/api/v1/media/00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}.webp`;

  async function createOrder(
    token: string,
    body: Record<string, unknown>,
  ): Promise<OrderResponse> {
    const response = await request(server)
      .post("/api/v1/orders")
      .set(bearer(token))
      .send({
        items: [{ productId, quantity: 2 }],
        ...body,
      })
      .expect(201);
    return response.body as OrderResponse;
  }

  async function transition(
    token: string,
    order: Pick<OrderResponse, "id" | "version">,
    status: OrderStatus,
  ): Promise<OrderResponse> {
    const response = await request(server)
      .patch(`/api/v1/orders/${order.id}/transition`)
      .set(bearer(token))
      .send({ status, version: order.version })
      .expect(200);
    return response.body as OrderResponse;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    jwt = app.get(JwtService);
    otp = app.get(OtpService);
    server = app.getHttpServer() as Parameters<typeof request>[0];

    const userData = {
      customer: { phone: "+99365000101", role: Role.CUSTOMER },
      otherCustomer: { phone: "+99365000102", role: Role.CUSTOMER },
      operator: { phone: "+99365000103", role: Role.OPERATOR },
      cook: { phone: "+99365000104", role: Role.COOK },
      otherCook: { phone: "+99365000105", role: Role.COOK },
      courier: { phone: "+99365000106", role: Role.COURIER },
      otherCourier: { phone: "+99365000107", role: Role.COURIER },
      accountant: { phone: "+99365000108", role: Role.ACCOUNTANT },
      admin: { phone: "+99365000109", role: Role.ADMIN },
      superAdmin: { phone: "+99365000111", role: Role.SUPER_ADMIN },
      inactive: {
        phone: "+99365000110",
        role: Role.CUSTOMER,
        isActive: false,
      },
    } satisfies Record<
      keyof TestUsers,
      { phone: string; role: Role; isActive?: boolean }
    >;

    const created = await Promise.all(
      Object.entries(userData).map(async ([key, data]) => [
        key,
        await prisma.user.create({
          data: {
            ...data,
            firstName: key,
          },
        }),
      ]),
    );
    users = Object.fromEntries(created) as TestUsers;

    tokens = Object.fromEntries(
      await Promise.all(
        Object.entries(users).map(async ([key, user]) => [
          key,
          await jwt.signAsync({
            sub: user.id,
            phone: user.phone,
            role: user.role,
          }),
        ]),
      ),
    ) as Record<keyof TestUsers, string>;

    const category = await prisma.category.create({
      data: { name: "Security test category", slug: "security-test-category" },
    });
    const product = await prisma.product.create({
      data: {
        categoryId: category.id,
        name: "Security test meal",
        slug: "security-test-meal",
        description: "Meal used by isolated end-to-end tests",
        price: 75,
      },
    });
    productId = product.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it("exposes only public health data with security and CORS headers", async () => {
    const allowed = await request(server)
      .get("/api/v1/health")
      .set("Origin", "http://localhost:3000")
      .expect(200);
    expect(allowed.headers["access-control-allow-origin"]).toBe(
      "http://localhost:3000",
    );
    expect(allowed.headers["x-content-type-options"]).toBe("nosniff");
    expect(allowed.headers["x-powered-by"]).toBeUndefined();

    const denied = await request(server)
      .get("/api/v1/health")
      .set("Origin", "https://evil.example")
      .expect(200);
    expect(denied.headers["access-control-allow-origin"]).toBeUndefined();

    const locationPreflight = await request(server)
      .options("/api/v1/tracking/me/location")
      .set("Origin", "http://localhost:3000")
      .set("Access-Control-Request-Method", "PUT")
      .expect(204);
    expect(locationPreflight.headers["access-control-allow-methods"]).toContain(
      "PUT",
    );
  });

  it("rejects missing, malformed, wrong-audience and inactive-user tokens", async () => {
    await request(server).get("/api/v1/orders").expect(401);
    await request(server)
      .get("/api/v1/orders")
      .set(bearer("not-a-jwt"))
      .expect(401);

    const wrongAudience = await jwt.signAsync(
      {
        sub: users.customer.id,
        phone: users.customer.phone,
        role: Role.CUSTOMER,
      },
      { audience: "another-service" },
    );
    await request(server)
      .get("/api/v1/orders")
      .set(bearer(wrongAudience))
      .expect(401);
    await request(server)
      .get("/api/v1/orders")
      .set(bearer(tokens.inactive))
      .expect(401);
  });

  it("uses the database role instead of trusting a role embedded in JWT", async () => {
    const forgedRole = await jwt.signAsync({
      sub: users.customer.id,
      phone: users.customer.phone,
      role: Role.ADMIN,
    });
    await request(server)
      .post("/api/v1/catalog/categories")
      .set(bearer(forgedRole))
      .send({ name: "Forbidden", slug: "forbidden-role-escalation" })
      .expect(403);
  });

  it("rejects unknown DTO fields and non-numeric OTP codes", async () => {
    await request(server)
      .post("/api/v1/auth/otp/verify")
      .send({ phone: "+99365000999", code: "12a456" })
      .expect(400);
    await request(server)
      .post("/api/v1/auth/otp/verify")
      .send({ phone: "+99365000999", code: "123456", isAdmin: true })
      .expect(400);
  });

  it("consumes an OTP once even under concurrent verification", async () => {
    const phone = "+99365000201";
    const challenge = await otp.issue(phone);

    const attempts = await Promise.all([
      request(server)
        .post("/api/v1/auth/otp/verify")
        .send({ phone, code: challenge.code }),
      request(server)
        .post("/api/v1/auth/otp/verify")
        .send({ phone, code: challenge.code }),
    ]);
    expect(attempts.map(({ status }) => status).sort()).toEqual([200, 401]);

    const successful = attempts.find(({ status }) => status === 200);
    expect(successful).toBeDefined();
    const session = successful?.body as SessionResponse;
    expect(session.accessToken).toEqual(expect.any(String));
    expect(session.refreshToken).toEqual(expect.any(String));

    const [tokenId] = session.refreshToken.split(".");
    await request(server)
      .post("/api/v1/auth/logout")
      .send({ refreshToken: `${tokenId}.wrong-secret` })
      .expect(200);

    const refreshed = await request(server)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: session.refreshToken })
      .expect(200);
    const rotated = refreshed.body as SessionResponse;

    const rotations = await Promise.all([
      request(server)
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: rotated.refreshToken }),
      request(server)
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: rotated.refreshToken }),
    ]);
    expect(rotations.map(({ status }) => status).sort()).toEqual([200, 401]);
  });

  it("locks an OTP after five incorrect attempts", async () => {
    const phone = "+99365000202";
    const challenge = await otp.issue(phone);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(otp.verify(phone, "000000")).resolves.toBe("incorrect");
    }
    await expect(otp.verify(phone, challenge.code)).resolves.toBe(
      "unavailable",
    );
  });

  it("enforces admin-only catalog mutations", async () => {
    await request(server)
      .post("/api/v1/catalog/categories")
      .set(bearer(tokens.operator))
      .send({ name: "Operator category", slug: "operator-category" })
      .expect(403);

    await request(server)
      .post("/api/v1/catalog/categories")
      .set(bearer(tokens.admin))
      .send({
        name: "Admin category",
        slug: "admin-category",
        unexpected: true,
      })
      .expect(400);

    const categoryResponse = await request(server)
      .post("/api/v1/catalog/categories")
      .set(bearer(tokens.admin))
      .send({ name: "Admin category", slug: "admin-category" })
      .expect(201);
    const categoryId = (categoryResponse.body as { id: string }).id;

    await request(server)
      .post("/api/v1/catalog/products")
      .set(bearer(tokens.operator))
      .send({
        categoryId,
        name: "Operator product",
        slug: "operator-product",
        description: "Must not be created",
        price: 10,
      })
      .expect(403);

    await request(server)
      .post("/api/v1/catalog/products")
      .set(bearer(tokens.admin))
      .send({
        categoryId,
        name: "External image product",
        slug: "external-image-product",
        description: "External image URLs are forbidden",
        price: 12,
        imageUrls: ["https://example.com/not-private-storage.jpg"],
      })
      .expect(400);

    await request(server)
      .post("/api/v1/catalog/products")
      .set(bearer(tokens.admin))
      .send({
        categoryId,
        name: "Too many images",
        slug: "too-many-images",
        description: "The DTO enforces the product image limit",
        price: 15,
        imageUrls: Array.from({ length: 11 }, (_, index) =>
          mediaUrl(index + 1),
        ),
      })
      .expect(400);

    const imageUrls = [mediaUrl(1), mediaUrl(2), mediaUrl(3)];
    const createdProductResponse = await request(server)
      .post("/api/v1/catalog/products")
      .set(bearer(tokens.admin))
      .send({
        categoryId,
        name: "Three image meal",
        slug: "three-image-meal",
        description: "A complete menu item with several ordered images",
        price: 49.9,
        imageUrls,
      })
      .expect(201);
    const createdProduct =
      createdProductResponse.body as CatalogProductResponse;
    expect(createdProduct).toMatchObject({
      categoryId,
      description: "A complete menu item with several ordered images",
      price: 49.9,
    });
    expect(createdProduct.images.map(({ url }) => url)).toEqual(imageUrls);
    expect(createdProduct.images.map(({ sortOrder }) => sortOrder)).toEqual([
      0, 1, 2,
    ]);

    const replacementUrls = [mediaUrl(3), mediaUrl(1)];
    const updatedProductResponse = await request(server)
      .patch(`/api/v1/catalog/products/${createdProduct.id}`)
      .set(bearer(tokens.admin))
      .send({ imageUrls: replacementUrls })
      .expect(200);
    const updatedProduct =
      updatedProductResponse.body as CatalogProductResponse;
    expect(updatedProduct.images.map(({ url }) => url)).toEqual(
      replacementUrls,
    );

    const publicProducts = await request(server)
      .get(`/api/v1/catalog/products?categoryId=${categoryId}`)
      .expect(200);
    expect(
      (publicProducts.body as CatalogProductResponse[])[0].images.map(
        ({ url }) => url,
      ),
    ).toEqual(replacementUrls);

    const fullProductResponse = await request(server)
      .post("/api/v1/catalog/products")
      .set(bearer(tokens.admin))
      .send({
        categoryId,
        name: "Full image meal",
        slug: "full-image-meal",
        description: "Already contains the maximum image count",
        price: 55,
        imageUrls: Array.from({ length: 10 }, (_, index) =>
          mediaUrl(index + 20),
        ),
      })
      .expect(201);
    const fullProduct = fullProductResponse.body as CatalogProductResponse;

    await request(server)
      .post(`/api/v1/catalog/products/${fullProduct.id}/images`)
      .set(bearer(tokens.admin))
      .send({ url: mediaUrl(99) })
      .expect(409);
  });

  it("reserves SUPER_ADMIN role management for a super administrator", async () => {
    const candidate = await prisma.user.create({
      data: {
        phone: "+99365000112",
        firstName: "Promotion candidate",
        role: Role.OPERATOR,
      },
    });

    await request(server)
      .patch(`/api/v1/staff/${candidate.id}`)
      .set(bearer(tokens.admin))
      .send({ role: Role.SUPER_ADMIN })
      .expect(403);

    const promoted = await request(server)
      .patch(`/api/v1/staff/${candidate.id}`)
      .set(bearer(tokens.superAdmin))
      .send({ role: Role.SUPER_ADMIN })
      .expect(200);
    expect((promoted.body as User).role).toBe(Role.SUPER_ADMIN);

    await prisma.user.delete({ where: { id: candidate.id } });

    await request(server)
      .patch(`/api/v1/staff/${users.superAdmin.id}`)
      .set(bearer(tokens.superAdmin))
      .send({ role: Role.ADMIN })
      .expect(400);
  });

  it("creates staff through the admin API without allowing role escalation", async () => {
    await request(server)
      .post("/api/v1/staff")
      .set(bearer(tokens.operator))
      .send({ phone: "+99365000113", role: Role.COURIER })
      .expect(403);

    await request(server)
      .post("/api/v1/staff")
      .set(bearer(tokens.admin))
      .send({ phone: "+99365000113", role: Role.SUPER_ADMIN })
      .expect(403);

    const created = await request(server)
      .post("/api/v1/staff")
      .set(bearer(tokens.admin))
      .send({
        phone: "+99365000113",
        firstName: "New",
        lastName: "Courier",
        role: Role.COURIER,
      })
      .expect(201);
    expect(created.body).toMatchObject({
      phone: "+99365000113",
      role: Role.COURIER,
      isActive: true,
    });

    await request(server)
      .post("/api/v1/staff")
      .set(bearer(tokens.admin))
      .send({ phone: "+99365000113", role: Role.COOK })
      .expect(409);
  });

  it("isolates saved addresses by owner and activates the latest order address", async () => {
    const firstResponse = await request(server)
      .post("/api/v1/users/me/addresses")
      .set(bearer(tokens.customer))
      .send({
        label: "Home",
        address: "Street 1",
        latitude: 37.95,
        longitude: 58.38,
      })
      .expect(201);
    const first = firstResponse.body as AddressResponse;

    const secondResponse = await request(server)
      .post("/api/v1/users/me/addresses")
      .set(bearer(tokens.customer))
      .send({
        label: "Work",
        address: "Street 2",
        latitude: 37.96,
        longitude: 58.39,
      })
      .expect(201);
    const second = secondResponse.body as AddressResponse;

    const addresses = await request(server)
      .get("/api/v1/users/me/addresses")
      .set(bearer(tokens.customer))
      .expect(200);
    const listed = addresses.body as AddressResponse[];
    expect(listed.filter(({ isActive }) => isActive)).toHaveLength(1);
    expect(listed.find(({ isActive }) => isActive)?.id).toBe(second.id);

    await request(server)
      .post(`/api/v1/users/me/addresses/${first.id}/activate`)
      .set(bearer(tokens.otherCustomer))
      .expect(404);

    const order = await createOrder(tokens.customer, { addressId: first.id });
    expect(order.address).toBe("Street 1");

    const afterOrder = await request(server)
      .get("/api/v1/users/me/addresses")
      .set(bearer(tokens.customer))
      .expect(200);
    const afterOrderAddresses = afterOrder.body as AddressResponse[];
    expect(afterOrderAddresses.find(({ isActive }) => isActive)?.id).toBe(
      first.id,
    );

    await request(server)
      .patch(`/api/v1/users/me/addresses/${first.id}`)
      .set(bearer(tokens.customer))
      .send({ address: "Street 1 changed" })
      .expect(200);
    const storedOrder = await request(server)
      .get(`/api/v1/orders/${order.id}`)
      .set(bearer(tokens.customer))
      .expect(200);
    expect((storedOrder.body as OrderResponse).address).toBe("Street 1");

    await request(server)
      .get(`/api/v1/orders/${order.id}`)
      .set(bearer(tokens.otherCustomer))
      .expect(403);
  });

  it("allows only one concurrent order mutation to win", async () => {
    const order = await createOrder(tokens.customer, {});
    const outcomes = await Promise.all([
      request(server)
        .patch(`/api/v1/orders/${order.id}/transition`)
        .set(bearer(tokens.operator))
        .send({ status: OrderStatus.CONFIRMED, version: order.version }),
      request(server)
        .patch(`/api/v1/orders/${order.id}/cancel`)
        .set(bearer(tokens.customer))
        .send({ reason: "Changed my mind", version: order.version }),
    ]);
    expect(outcomes.filter(({ status }) => status === 200)).toHaveLength(1);
    expect(
      outcomes.every(({ status }) => [200, 403, 409].includes(status)),
    ).toBe(true);

    const stored = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect([OrderStatus.CONFIRMED, OrderStatus.CANCELLED]).toContain(
      stored.status,
    );
    expect(stored.version).toBe(2);
  });

  it("enforces every role, ownership check and cash workflow transition", async () => {
    let order = await createOrder(tokens.customer, {});

    await request(server)
      .patch(`/api/v1/orders/${order.id}/transition`)
      .set(bearer(tokens.customer))
      .send({ status: OrderStatus.CONFIRMED, version: order.version })
      .expect(403);

    order = await transition(tokens.operator, order, OrderStatus.CONFIRMED);
    order = await transition(
      tokens.operator,
      order,
      OrderStatus.SENT_TO_KITCHEN,
    );
    order = await transition(tokens.cook, order, OrderStatus.COOKING);

    await request(server)
      .patch(`/api/v1/orders/${order.id}/transition`)
      .set(bearer(tokens.otherCook))
      .send({ status: OrderStatus.READY, version: order.version })
      .expect(403);
    order = await transition(tokens.cook, order, OrderStatus.READY);

    const assignedResponse = await request(server)
      .patch(`/api/v1/orders/${order.id}/assign-courier`)
      .set(bearer(tokens.operator))
      .send({ courierId: users.courier.id, version: order.version })
      .expect(200);
    order = assignedResponse.body as OrderResponse;

    await request(server)
      .patch(`/api/v1/orders/${order.id}/transition`)
      .set(bearer(tokens.otherCourier))
      .send({
        status: OrderStatus.OUT_FOR_DELIVERY,
        version: order.version,
      })
      .expect(403);
    order = await transition(
      tokens.courier,
      order,
      OrderStatus.OUT_FOR_DELIVERY,
    );
    order = await transition(tokens.courier, order, OrderStatus.DELIVERED);

    await request(server)
      .post(`/api/v1/orders/${order.id}/rating`)
      .set(bearer(tokens.otherCustomer))
      .send({ score: 5, comment: "Not my order" })
      .expect(403);
    await request(server)
      .post(`/api/v1/orders/${order.id}/rating`)
      .set(bearer(tokens.customer))
      .send({ score: 5, comment: "Delivered safely" })
      .expect(201);
    await request(server)
      .post(`/api/v1/orders/${order.id}/rating`)
      .set(bearer(tokens.customer))
      .send({ score: 4 })
      .expect(409);

    order = await transition(tokens.courier, order, OrderStatus.CASH_RETURNED);
    expect(order.cashSettlement?.status).toBe("RECORDED");
    order = await transition(tokens.operator, order, OrderStatus.COMPLETED);
    expect(order.cashSettlement?.status).toBe("CONFIRMED");
    order = await transition(tokens.accountant, order, OrderStatus.RECONCILED);
    expect(order.cashSettlement?.status).toBe("RECONCILED");

    const historyResponse = await request(server)
      .get(`/api/v1/orders/${order.id}`)
      .set(bearer(tokens.customer))
      .expect(200);
    const history = historyResponse.body as OrderResponse;
    expect(history.rating).toMatchObject({
      score: 5,
      comment: "Delivered safely",
    });
    expect(history.transitions?.map(({ toStatus }) => toStatus)).toEqual([
      OrderStatus.CONFIRMED,
      OrderStatus.SENT_TO_KITCHEN,
      OrderStatus.COOKING,
      OrderStatus.READY,
      OrderStatus.ASSIGNED_TO_COURIER,
      OrderStatus.OUT_FOR_DELIVERY,
      OrderStatus.DELIVERED,
      OrderStatus.CASH_RETURNED,
      OrderStatus.COMPLETED,
      OrderStatus.RECONCILED,
    ]);
  });

  it("lets only trusted staff cancel SENT_TO_KITCHEN and blocks cancellation once cooking starts", async () => {
    for (const role of ["operator", "admin", "superAdmin"] as const) {
      let order = await createOrder(tokens.customer, {});
      order = await transition(tokens.operator, order, OrderStatus.CONFIRMED);
      order = await transition(
        tokens.operator,
        order,
        OrderStatus.SENT_TO_KITCHEN,
      );

      await request(server)
        .patch(`/api/v1/orders/${order.id}/cancel`)
        .set(bearer(tokens.customer))
        .send({ reason: "Customer cannot stop kitchen handoff", version: order.version })
        .expect(403);

      await request(server)
        .patch(`/api/v1/orders/${order.id}/cancel`)
        .set(bearer(tokens[role]))
        .send({ reason: `Cancelled by ${role}`, version: order.version })
        .expect(200);
    }

    let cooking = await createOrder(tokens.customer, {});
    cooking = await transition(
      tokens.operator,
      cooking,
      OrderStatus.CONFIRMED,
    );
    cooking = await transition(
      tokens.operator,
      cooking,
      OrderStatus.SENT_TO_KITCHEN,
    );
    cooking = await transition(tokens.cook, cooking, OrderStatus.COOKING);

    for (const role of ["operator", "admin", "superAdmin"] as const) {
      await request(server)
        .patch(`/api/v1/orders/${cooking.id}/cancel`)
        .set(bearer(tokens[role]))
        .send({ reason: "Cooking already started", version: cooking.version })
        .expect(403);
    }
  });

  it("tracks only the authenticated courier and exposes dispatch data only to trusted staff", async () => {
    const location = {
      latitude: 37.9601,
      longitude: 58.3261,
      accuracy: 14,
      recordedAt: new Date().toISOString(),
    };

    await request(server)
      .put("/api/v1/tracking/me/location")
      .set(bearer(tokens.customer))
      .send(location)
      .expect(403);
    await request(server)
      .put("/api/v1/tracking/me/location")
      .set(bearer(tokens.operator))
      .send(location)
      .expect(403);
    await request(server)
      .put("/api/v1/tracking/me/location")
      .set(bearer(tokens.courier))
      .send({ ...location, courierId: users.otherCourier.id })
      .expect(400);
    await request(server)
      .put("/api/v1/tracking/me/location")
      .set(bearer(tokens.courier))
      .send({ ...location, latitude: 91 })
      .expect(400);
    await request(server)
      .put("/api/v1/tracking/me/location")
      .set(bearer(tokens.courier))
      .send({
        ...location,
        recordedAt: new Date(Date.now() + 120_000).toISOString(),
      })
      .expect(422);

    const published = await request(server)
      .put("/api/v1/tracking/me/location")
      .set(bearer(tokens.courier))
      .send(location)
      .expect(200);
    expect(published.body).toMatchObject({
      accepted: true,
      nextUpdateInSeconds: 120,
      location: {
        latitude: location.latitude,
        longitude: location.longitude,
      },
    });

    await request(server)
      .put("/api/v1/tracking/me/location")
      .set(bearer(tokens.courier))
      .send({
        ...location,
        recordedAt: new Date(
          Date.parse(location.recordedAt) - 1_000,
        ).toISOString(),
      })
      .expect(409);

    const assignedOrders: OrderResponse[] = [];
    for (let index = 0; index < 2; index += 1) {
      let order = await createOrder(tokens.customer, {});
      order = await transition(tokens.operator, order, OrderStatus.CONFIRMED);
      order = await transition(
        tokens.operator,
        order,
        OrderStatus.SENT_TO_KITCHEN,
      );
      order = await transition(tokens.cook, order, OrderStatus.COOKING);
      order = await transition(tokens.cook, order, OrderStatus.READY);
      const assigned = await request(server)
        .patch(`/api/v1/orders/${order.id}/assign-courier`)
        .set(bearer(tokens.operator))
        .send({
          courierId: users.courier.id,
          version: order.version,
        })
        .expect(200);
      assignedOrders.push(assigned.body as OrderResponse);
    }

    await request(server)
      .get("/api/v1/tracking/dispatch")
      .set(bearer(tokens.courier))
      .expect(403);
    await request(server)
      .get("/api/v1/tracking/dispatch")
      .set(bearer(tokens.customer))
      .expect(403);

    const dispatch = await request(server)
      .get("/api/v1/tracking/dispatch")
      .set(bearer(tokens.operator))
      .expect(200);
    const tracked = (
      dispatch.body as {
        courierUpdateIntervalSeconds: number;
        couriers: Array<{
          id: string;
          presence: string;
          location: { latitude: number; longitude: number } | null;
          activeOrders: Array<{
            id: string;
            customer: { phone: string };
            items: Array<{ productName: string; quantity: number }>;
          }>;
        }>;
      }
    ).couriers.find(({ id }) => id === users.courier.id);
    expect(dispatch.body).toMatchObject({
      courierUpdateIntervalSeconds: 120,
    });
    expect(tracked).toMatchObject({
      presence: "ONLINE",
      location: {
        latitude: location.latitude,
        longitude: location.longitude,
      },
    });
    expect(tracked?.activeOrders.map(({ id }) => id)).toEqual(
      expect.arrayContaining(assignedOrders.map(({ id }) => id)),
    );
    expect(tracked?.activeOrders[0]?.customer.phone).toBe(
      users.customer.phone,
    );
    expect(tracked?.activeOrders[0]?.items[0]).toMatchObject({
      productName: "Security test meal",
      quantity: 2,
    });

    await request(server)
      .get("/api/v1/tracking/dispatch")
      .set(bearer(tokens.admin))
      .expect(200);
    await request(server)
      .get("/api/v1/tracking/dispatch")
      .set(bearer(tokens.superAdmin))
      .expect(200);

    await request(server)
      .delete("/api/v1/tracking/me/location")
      .set(bearer(tokens.otherCourier))
      .expect(200);
    const stillTracked = await request(server)
      .get("/api/v1/tracking/dispatch")
      .set(bearer(tokens.operator))
      .expect(200);
    expect(
      (
        stillTracked.body as {
          couriers: Array<{ id: string; presence: string }>;
        }
      ).couriers.find(({ id }) => id === users.courier.id)?.presence,
    ).toBe("ONLINE");

    await request(server)
      .delete("/api/v1/tracking/me/location")
      .set(bearer(tokens.courier))
      .expect(200);
    const stopped = await request(server)
      .get("/api/v1/tracking/dispatch")
      .set(bearer(tokens.operator))
      .expect(200);
    expect(
      (
        stopped.body as {
          couriers: Array<{
            id: string;
            presence: string;
            location: unknown;
          }>;
        }
      ).couriers.find(({ id }) => id === users.courier.id),
    ).toMatchObject({ presence: "OFFLINE", location: null });
  });

  it("validates image contents, restricts deletion and stores safe WebP objects", async () => {
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    );

    await request(server)
      .post("/api/v1/media/images")
      .set(bearer(tokens.customer))
      .attach("file", png, { filename: "pixel.png", contentType: "image/png" })
      .expect(403);
    await request(server)
      .post("/api/v1/media/images")
      .set(bearer(tokens.operator))
      .attach("file", Buffer.from("not an image"), {
        filename: "fake.png",
        contentType: "image/png",
      })
      .expect(400);

    const uploaded = await request(server)
      .post("/api/v1/media/images")
      .set(bearer(tokens.operator))
      .attach("file", png, { filename: "pixel.png", contentType: "image/png" })
      .expect(201);
    const filename = (uploaded.body as { filename: string }).filename;
    expect(filename).toMatch(/^[0-9a-f-]{36}\.webp$/);

    await request(server)
      .get(`/api/v1/media/${filename}`)
      .expect("Content-Type", /image\/webp/)
      .expect(200);
    await request(server).get("/api/v1/media/not-a-safe-name.webp").expect(404);
    await request(server)
      .delete(`/api/v1/media/images/${filename}`)
      .set(bearer(tokens.operator))
      .expect(403);
    await request(server)
      .delete(`/api/v1/media/images/${filename}`)
      .set(bearer(tokens.admin))
      .expect(204);
  });

  it("rate-limits OTP delivery and never exposes codes outside development", async () => {
    const responses = [];
    for (let index = 0; index < 4; index += 1) {
      responses.push(
        await request(server)
          .post("/api/v1/auth/otp/request")
          .send({ phone: `+9936500030${index + 1}` }),
      );
    }
    expect(responses.map(({ status }) => status)).toEqual([200, 200, 200, 429]);
    for (const response of responses.slice(0, 3)) {
      expect(response.body).not.toHaveProperty("devCode");
    }
  });

  it("enforces a per-phone resend cooldown in Redis", async () => {
    const phone = "+99365000310";
    await otp.issue(phone);
    await expect(otp.issue(phone)).rejects.toMatchObject({ status: 429 });
  });
});
