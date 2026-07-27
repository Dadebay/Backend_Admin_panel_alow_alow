import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import * as argon2 from "argon2";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { OrderStatus, Role, type User } from "../src/generated/prisma/client";
import { PrismaService } from "../src/prisma/prisma.service";

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
};

describe("backend security and critical workflow", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  let server: Parameters<typeof request>[0];
  let users: TestUsers;
  let tokens: Record<keyof TestUsers, string>;
  let productId: string;

  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

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
    const code = "582941";
    await prisma.phoneOtp.create({
      data: {
        phone,
        codeHash: await argon2.hash(`${code}:${process.env.OTP_PEPPER ?? ""}`),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    const attempts = await Promise.all([
      request(server).post("/api/v1/auth/otp/verify").send({ phone, code }),
      request(server).post("/api/v1/auth/otp/verify").send({ phone, code }),
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

    await request(server)
      .post("/api/v1/catalog/categories")
      .set(bearer(tokens.admin))
      .send({ name: "Admin category", slug: "admin-category" })
      .expect(201);
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
  });

  it("rejects cancellation after kitchen handoff", async () => {
    let order = await createOrder(tokens.customer, {});
    order = await transition(tokens.operator, order, OrderStatus.CONFIRMED);
    order = await transition(
      tokens.operator,
      order,
      OrderStatus.SENT_TO_KITCHEN,
    );

    await request(server)
      .patch(`/api/v1/orders/${order.id}/cancel`)
      .set(bearer(tokens.operator))
      .send({ reason: "Too late", version: order.version })
      .expect(403);
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
          .send({ phone: "+99365000301" }),
      );
    }
    expect(responses.map(({ status }) => status)).toEqual([200, 200, 200, 429]);
    for (const response of responses.slice(0, 3)) {
      expect(response.body).not.toHaveProperty("devCode");
    }
  });
});
