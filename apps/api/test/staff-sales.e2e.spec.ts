import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import { randomUUID } from "node:crypto";
import * as argon2 from "argon2";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { OrderStatus, Role, type User } from "../src/generated/prisma/client";
import { PrismaService } from "../src/prisma/prisma.service";
import { UsersService } from "../src/users/users.service";
import type { AccountingSalesPageDto } from "../src/accounting/accounting-inspection.dto";
import { OtpService } from "../src/auth/otp.service";

describe("staff removal and administrator shift sales", () => {
  let app: INestApplication,
    prisma: PrismaService,
    server: Parameters<typeof request>[0],
    jwt: JwtService;
  const users = {} as Record<Role, User>;
  const tokens = {} as Record<Role, string>;
  const auth = (role: Role) => ({ Authorization: `Bearer ${tokens[role]}` });
  const sales = "/api/v1/accounting/sales";
  const dates = "fromDate=2024-05-01&toDate=2024-05-31";
  let yesterdayId: string;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    jwt = app.get(JwtService);
    server = app.getHttpServer() as Parameters<typeof request>[0];
    for (const [index, role] of Object.values(Role).entries()) {
      users[role] = await prisma.user.create({
        data: {
          phone: `+993650078${index.toString().padStart(2, "0")}`,
          firstName: `Staff sales ${role}`,
          role,
        },
      });
      tokens[role] = await jwt.signAsync({
        sub: users[role].id,
        phone: users[role].phone,
        role,
      });
    }
    await prisma.accountingSettings.upsert({
      where: { id: "default" },
      create: { id: "default" },
      update: { firstShiftStartMinutes: 570, secondShiftStartMinutes: 1140 },
    });
    const makeOrder = (
      createdAt: string,
      food: number,
      delivery: number,
      status: OrderStatus,
      cashAt?: string,
    ) =>
      prisma.order.create({
        data: {
          customerId: users.CUSTOMER.id,
          courierId: users.COURIER.id,
          createdAt: new Date(createdAt),
          status,
          subtotal: food + 5,
          discount: 5,
          deliveryFee: delivery,
          total: food + delivery,
          address: "Test shift address",
          latitude: 37.87,
          longitude: 58.31,
          ...(cashAt
            ? {
                cashSettlement: {
                  create: {
                    courierId: users.COURIER.id,
                    amount: food,
                    status: "CONFIRMED",
                    operatorTakenAt: new Date(cashAt),
                  },
                },
              }
            : {}),
        },
      });
    yesterdayId = (
      await makeOrder(
        "2024-05-06T13:00:00Z",
        85,
        15,
        OrderStatus.CASH_RETURNED,
        "2024-05-07T13:20:00Z",
      )
    ).id;
    await makeOrder(
      "2024-05-05T13:00:00Z",
      50,
      5,
      OrderStatus.CASH_RETURNED,
      "2024-05-06T13:20:00Z",
    );
    await makeOrder("2024-05-07T05:00:00Z", 40, 10, OrderStatus.COOKING);
    await makeOrder("2024-05-07T06:00:00Z", 150, 0, OrderStatus.CANCELLED);
  });
  afterAll(async () => {
    await app.close();
  });

  it("allows administrators/accountants/owners but rejects all other roles and anonymous reads", async () => {
    await request(server).get(`${sales}?${dates}`).expect(401);
    for (const role of [Role.ADMIN, Role.ACCOUNTANT, Role.SUPER_ADMIN]) {
      await request(server)
        .get(`${sales}?${dates}`)
        .set(auth(role))
        .expect(200);
    }
    for (const role of [
      Role.CUSTOMER,
      Role.OPERATOR,
      Role.COOK,
      Role.COURIER,
    ]) {
      await request(server)
        .get(`${sales}?${dates}`)
        .set(auth(role))
        .expect(403);
    }
    const before = await prisma.adminRolePageAccess.findUnique({
      where: { role: Role.OPERATOR },
    });
    await prisma.adminRolePageAccess.upsert({
      where: { role: Role.OPERATOR },
      create: { role: Role.OPERATOR, allowedPages: ["ACCOUNTING", "STAFF"] },
      update: { allowedPages: ["ACCOUNTING", "STAFF"] },
    });
    try {
      await request(server)
        .get(`${sales}?${dates}`)
        .set(auth(Role.OPERATOR))
        .expect(403);
      await request(server)
        .delete(`/api/v1/staff/${users.COOK.id}`)
        .set(auth(Role.OPERATOR))
        .expect(403);
    } finally {
      if (before)
        await prisma.adminRolePageAccess.update({
          where: { role: Role.OPERATOR },
          data: { allowedPages: before.allowedPages },
        });
      else
        await prisma.adminRolePageAccess.delete({
          where: { role: Role.OPERATOR },
        });
    }
    for (const path of ["report", "overview", "orders", "audit", "carryover"]) {
      await request(server)
        .get(`/api/v1/accounting/${path}?${dates}`)
        .set(auth(Role.ADMIN))
        .expect(403);
    }
  });

  it("separates creation time and cash-return time and computes totals across all pages", async () => {
    const returned = await request(server)
      .get(`${sales}?shiftKey=2024-05-07:first`)
      .set(auth(Role.ADMIN))
      .expect(200);
    expect(returned.body).toMatchObject({
      total: 1,
      summary: { foodAmount: 85, deliveryAmount: 15, totalAmount: 100 },
    });
    expect((returned.body as AccountingSalesPageDto).items[0]).toMatchObject({
      id: yesterdayId,
      createdAt: "2024-05-06T13:00:00.000Z",
      cashReturnedAt: "2024-05-07T13:20:00.000Z",
    });
    const created = await request(server)
      .get(`${sales}?shiftKey=2024-05-07:first&basis=created`)
      .set(auth(Role.ADMIN))
      .expect(200);
    expect(created.body).toMatchObject({
      total: 1,
      summary: { foodAmount: 40, deliveryAmount: 10, totalAmount: 50 },
    });
    expect(
      (created.body as AccountingSalesPageDto).items[0]?.cashReturnedAt,
    ).toBeNull();
    const paginated = await request(server)
      .get(`${sales}?${dates}&limit=1&page=2`)
      .set(auth(Role.ADMIN))
      .expect(200);
    expect(paginated.body).toMatchObject({
      total: 2,
      page: 2,
      limit: 1,
      summary: { foodAmount: 135, deliveryAmount: 20, totalAmount: 155 },
    });
    expect((paginated.body as AccountingSalesPageDto).items).toHaveLength(1);
    const empty = await request(server)
      .get(`${sales}?${dates}&basis=created&status=CANCELLED`)
      .set(auth(Role.ADMIN))
      .expect(200);
    expect(empty.body).toMatchObject({
      items: [],
      total: 0,
      summary: { foodAmount: 0, deliveryAmount: 0, totalAmount: 0 },
    });
    for (const query of [
      "basis=other",
      "page=0",
      "limit=101",
      "shiftKey=invalid",
      "fromDate=2024-05-31&toDate=2024-05-01",
      "fromDate=2024-02-30&toDate=2024-03-01",
    ]) {
      await request(server)
        .get(`${sales}?${query}`)
        .set(auth(Role.ADMIN))
        .expect(400);
    }
  });

  it("uses frozen submitted packet membership even when another receipt later enters the same interval", async () => {
    const packet = await prisma.cashHandoff.create({
      data: {
        shiftKey: "2024-05-07:first",
        shiftName: "Submitted sales shift",
        periodStart: new Date("2024-05-07T04:30:00Z"),
        periodEnd: new Date("2024-05-07T14:00:00Z"),
        submittedById: users.ADMIN.id,
        expectedAmount: 85,
        declaredAmount: 85,
        settlementCount: 1,
      },
    });
    await prisma.cashSettlement.update({
      where: { orderId: yesterdayId },
      data: { cashHandoffId: packet.id },
    });
    await prisma.order.create({
      data: {
        customerId: users.CUSTOMER.id,
        status: OrderStatus.CASH_RETURNED,
        subtotal: 35,
        total: 45,
        deliveryFee: 10,
        address: "Late receipt",
        latitude: 37.87,
        longitude: 58.31,
        createdAt: new Date("2024-05-07T07:00:00Z"),
        cashSettlement: {
          create: {
            courierId: users.COURIER.id,
            amount: 35,
            status: "CONFIRMED",
            operatorTakenAt: new Date("2024-05-07T13:25:00Z"),
          },
        },
      },
    });
    const frozen = await request(server)
      .get(`${sales}?shiftKey=2024-05-07:first`)
      .set(auth(Role.ADMIN))
      .expect(200);
    expect(frozen.body).toMatchObject({
      total: 1,
      summary: { foodAmount: 85 },
    });
    const all = await request(server)
      .get(`${sales}?fromDate=2024-05-07&toDate=2024-05-07`)
      .set(auth(Role.ADMIN))
      .expect(200);
    expect(all.body).toMatchObject({ total: 2, summary: { foodAmount: 120 } });
  });

  it("matches daily cash cards across legacy packets and late receipts", async () => {
    const daily = await request(server)
      .get(`${sales}?shiftKey=2024-05-07:day`)
      .set(auth(Role.ADMIN))
      .expect(200);
    expect(daily.body).toMatchObject({
      total: 2,
      summary: { foodAmount: 120, deliveryAmount: 25, totalAmount: 145 },
    });
    const cards = await request(server)
      .get("/api/v1/accounting/shifts?fromDate=2024-05-07&toDate=2024-05-07")
      .set(auth(Role.ADMIN))
      .expect(200);
    expect(cards.body).toMatchObject([
      { shiftKey: "2024-05-07:day", expectedAmount: 120, settlementCount: 2 },
    ]);
    const legacy = await request(server)
      .get(`${sales}?shiftKey=2024-05-07:first`)
      .set(auth(Role.ADMIN))
      .expect(200);
    expect(legacy.body).toMatchObject({
      total: 1,
      summary: { foodAmount: 85 },
    });
  });

  it("removes staff from lists, revokes existing sessions and preserves cash/order/audit relationships", async () => {
    const target = await prisma.user.create({
      data: {
        phone: "+99365007900",
        role: Role.COURIER,
        lastLoginAt: new Date(),
      },
    });
    const historical = await prisma.order.create({
      data: {
        customerId: users.CUSTOMER.id,
        courierId: target.id,
        status: OrderStatus.RECONCILED,
        subtotal: 10,
        total: 10,
        address: "Historical order",
        latitude: 37.87,
        longitude: 58.31,
        cashSettlement: {
          create: { courierId: target.id, amount: 10, status: "RECONCILED" },
        },
        transitions: {
          create: {
            actorId: target.id,
            fromStatus: OrderStatus.DELIVERED,
            toStatus: OrderStatus.CASH_RETURNED,
          },
        },
      },
    });
    const session = await prisma.refreshToken.create({
      data: {
        userId: target.id,
        secretHash: await argon2.hash("test-staff-session"),
        expiresAt: new Date(Date.now() + 600000),
      },
    });
    const targetToken = await jwt.signAsync({
      sub: target.id,
      phone: target.phone,
      role: target.role,
      sid: session.id,
    });
    await request(server)
      .delete(`/api/v1/staff/${target.id}`)
      .set(auth(Role.ADMIN))
      .expect(204);
    const list = await request(server)
      .get("/api/v1/staff")
      .set(auth(Role.ADMIN))
      .expect(200);
    expect(
      (list.body as { id: string }[]).some((member) => member.id === target.id),
    ).toBe(false);
    const recent = await request(server)
      .get("/api/v1/staff/recent-logins")
      .set(auth(Role.ADMIN))
      .expect(200);
    expect(
      (recent.body as { id: string }[]).some(
        (member) => member.id === target.id,
      ),
    ).toBe(false);
    const stored = await prisma.user.findUniqueOrThrow({
      where: { id: target.id },
    });
    expect(stored.isActive).toBe(false);
    expect(stored.deletedAt).toBeInstanceOf(Date);
    expect(
      (
        await prisma.refreshToken.findUniqueOrThrow({
          where: { id: session.id },
        })
      ).revokedAt,
    ).toBeInstanceOf(Date);
    await request(server)
      .get("/api/v1/users/me")
      .set({ Authorization: `Bearer ${targetToken}` })
      .expect(401);
    await request(server)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: `${session.id}.test-staff-session` })
      .expect(401);
    const challenge = await app.get(OtpService).issue(target.phone);
    await request(server)
      .post("/api/v1/auth/otp/verify")
      .send({ phone: target.phone, code: challenge.code })
      .expect(401);
    await request(server)
      .patch(`/api/v1/staff/${target.id}`)
      .set(auth(Role.ADMIN))
      .send({ role: Role.COURIER, isActive: true })
      .expect(404);
    expect(
      (
        await prisma.order.findUniqueOrThrow({
          where: { id: historical.id },
          include: { cashSettlement: true, transitions: true },
        })
      ).cashSettlement?.courierId,
    ).toBe(target.id);
    await request(server)
      .delete(`/api/v1/staff/${target.id}`)
      .set(auth(Role.ADMIN))
      .expect(204);
    expect(
      await prisma.auditLog.count({
        where: { entityId: target.id, action: "staff.deleted" },
      }),
    ).toBe(1);
  });

  it("protects customer/self/owner accounts and staff with unfinished assignments", async () => {
    await request(server).delete(`/api/v1/staff/${users.COOK.id}`).expect(401);
    for (const role of [
      Role.CUSTOMER,
      Role.OPERATOR,
      Role.COOK,
      Role.COURIER,
      Role.ACCOUNTANT,
    ]) {
      await request(server)
        .delete(`/api/v1/staff/${users.COOK.id}`)
        .set(auth(role))
        .expect(403);
    }
    await request(server)
      .delete(`/api/v1/staff/${users.ADMIN.id}`)
      .set(auth(Role.ADMIN))
      .expect(400);
    await request(server)
      .delete(`/api/v1/staff/${users.SUPER_ADMIN.id}`)
      .set(auth(Role.ADMIN))
      .expect(403);
    await request(server)
      .delete(`/api/v1/staff/${users.SUPER_ADMIN.id}`)
      .set(auth(Role.SUPER_ADMIN))
      .expect(400);
    await request(server)
      .delete(`/api/v1/staff/${users.CUSTOMER.id}`)
      .set(auth(Role.ADMIN))
      .expect(404);
    await request(server)
      .delete(`/api/v1/staff/${randomUUID()}`)
      .set(auth(Role.ADMIN))
      .expect(404);
    await request(server)
      .delete("/api/v1/staff/invalid")
      .set(auth(Role.ADMIN))
      .expect(400);
    const busy = await prisma.order.create({
      data: {
        customerId: users.CUSTOMER.id,
        cookId: users.COOK.id,
        status: OrderStatus.COOKING,
        subtotal: 10,
        total: 10,
        address: "Active assignment",
        latitude: 37.87,
        longitude: 58.31,
      },
    });
    await request(server)
      .delete(`/api/v1/staff/${users.COOK.id}`)
      .set(auth(Role.ADMIN))
      .expect(409);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: users.COOK.id } }))
        .deletedAt,
    ).toBeNull();
    await prisma.order.update({
      where: { id: busy.id },
      data: { status: OrderStatus.CANCELLED },
    });
    await request(server)
      .delete(`/api/v1/staff/${users.COOK.id}`)
      .set(auth(Role.ADMIN))
      .expect(204);
    const disabledOwners = await prisma.user.findMany({
      where: {
        role: Role.SUPER_ADMIN,
        isActive: true,
        id: { not: users.SUPER_ADMIN.id },
      },
    });
    await prisma.user.updateMany({
      where: { id: { in: disabledOwners.map((user) => user.id) } },
      data: { isActive: false },
    });
    try {
      await expect(
        app.get(UsersService).remove(
          {
            id: users.ADMIN.id,
            phone: users.ADMIN.phone,
            role: Role.SUPER_ADMIN,
            adminPages: [],
            expandedAdminPages: [],
          },
          users.SUPER_ADMIN.id,
        ),
      ).rejects.toThrow("хотя бы один");
    } finally {
      await prisma.user.updateMany({
        where: { id: { in: disabledOwners.map((user) => user.id) } },
        data: { isActive: true },
      });
    }
    const otherOwner = await prisma.user.create({
      data: { phone: "+99365007901", role: Role.SUPER_ADMIN },
    });
    await request(server)
      .delete(`/api/v1/staff/${otherOwner.id}`)
      .set(auth(Role.SUPER_ADMIN))
      .expect(204);
  });

  it("handles concurrent removal without duplicate audit records", async () => {
    const target = await prisma.user.create({
      data: { phone: "+99365007902", role: Role.OPERATOR },
    });
    const results = await Promise.all(
      [1, 2].map(() =>
        request(server)
          .delete(`/api/v1/staff/${target.id}`)
          .set(auth(Role.ADMIN)),
      ),
    );
    expect(results.some((response) => response.status === 204)).toBe(true);
    expect(
      results.every((response) => [204, 409].includes(response.status)),
    ).toBe(true);
    expect(
      await prisma.auditLog.count({
        where: { action: "staff.deleted", entityId: target.id },
      }),
    ).toBe(1);
  });
});
