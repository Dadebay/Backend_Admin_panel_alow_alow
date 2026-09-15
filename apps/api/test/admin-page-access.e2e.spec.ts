import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import {
  AdminPage,
  Role,
  type User,
} from "../src/generated/prisma/client";
import { PrismaService } from "../src/prisma/prisma.service";

type ActorName = "accountant" | "admin" | "customer" | "superAdmin";
type PageAccessResponse = {
  role: Role;
  allowedPages: AdminPage[];
  availablePages: AdminPage[];
  editable: boolean;
  version: number;
};

describe("admin role page access", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: Parameters<typeof request>[0];
  let users: Record<ActorName, User>;
  let tokens: Record<ActorName, string>;

  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    const jwt = app.get(JwtService);
    server = app.getHttpServer() as Parameters<typeof request>[0];

    const roles = {
      accountant: Role.ACCOUNTANT,
      admin: Role.ADMIN,
      customer: Role.CUSTOMER,
      superAdmin: Role.SUPER_ADMIN,
    } satisfies Record<ActorName, Role>;
    users = Object.fromEntries(
      await Promise.all(
        Object.entries(roles).map(async ([name, role], index) => [
          name,
          await prisma.user.create({
            data: {
              phone: `+99365009${String(index + 1).padStart(3, "0")}`,
              firstName: `page-access-${name}`,
              role,
            },
          }),
        ]),
      ),
    ) as Record<ActorName, User>;
    tokens = Object.fromEntries(
      await Promise.all(
        Object.entries(users).map(async ([name, user]) => [
          name,
          await jwt.signAsync({
            sub: user.id,
            phone: user.phone,
            role: user.role,
          }),
        ]),
      ),
    ) as Record<ActorName, string>;
  });

  afterAll(async () => {
    await prisma.adminRolePageAccess.deleteMany();
    await prisma.auditLog.deleteMany({
      where: { action: "admin_page_access.updated" },
    });
    await prisma.user.deleteMany({
      where: { firstName: { startsWith: "page-access-" } },
    });
    await app.close();
  });

  it("returns safe defaults only to portal roles", async () => {
    await request(server).get("/api/v1/admin-page-access/me").expect(401);
    await request(server)
      .get("/api/v1/admin-page-access/me")
      .set(bearer(tokens.customer))
      .expect(403);

    const accountant = await request(server)
      .get("/api/v1/admin-page-access/me")
      .set(bearer(tokens.accountant))
      .expect(200);
    expect(accountant.body).toMatchObject({
      role: Role.ACCOUNTANT,
      allowedPages: [AdminPage.ACCOUNTING],
      availablePages: [AdminPage.ACCOUNTING],
      editable: true,
      version: 0,
    });

    const superAdmin = await request(server)
      .get("/api/v1/admin-page-access/me")
      .set(bearer(tokens.superAdmin))
      .expect(200);
    const superAdminBody = superAdmin.body as PageAccessResponse;
    expect(superAdminBody.editable).toBe(false);
    expect(superAdminBody.allowedPages).toEqual(Object.values(AdminPage));
  });

  it("lets only a super administrator update a role with optimistic concurrency", async () => {
    await request(server)
      .get("/api/v1/admin-page-access")
      .set(bearer(tokens.admin))
      .expect(403);
    await request(server)
      .put("/api/v1/admin-page-access/ADMIN")
      .set(bearer(tokens.admin))
      .send({ allowedPages: [AdminPage.ORDERS], version: 0 })
      .expect(403);

    const saved = await request(server)
      .put("/api/v1/admin-page-access/ADMIN")
      .set(bearer(tokens.superAdmin))
      .send({
        allowedPages: [AdminPage.ORDERS, AdminPage.CATALOG],
        version: 0,
      })
      .expect(200);
    expect(saved.body).toMatchObject({
      role: Role.ADMIN,
      allowedPages: [AdminPage.ORDERS, AdminPage.CATALOG],
      version: 1,
    });

    const mine = await request(server)
      .get("/api/v1/admin-page-access/me")
      .set(bearer(tokens.admin))
      .expect(200);
    const mineBody = mine.body as PageAccessResponse;
    expect(mineBody.allowedPages).toEqual([
      AdminPage.ORDERS,
      AdminPage.CATALOG,
    ]);

    await request(server)
      .put("/api/v1/admin-page-access/ADMIN")
      .set(bearer(tokens.superAdmin))
      .send({ allowedPages: [AdminPage.ORDERS], version: 0 })
      .expect(409);
    expect(
      await prisma.auditLog.count({
        where: {
          actorId: users.superAdmin.id,
          action: "admin_page_access.updated",
          entityId: Role.ADMIN,
        },
      }),
    ).toBe(1);
  });

  it("rejects role expansion and immutable role changes", async () => {
    await request(server)
      .put("/api/v1/admin-page-access/ACCOUNTANT")
      .set(bearer(tokens.superAdmin))
      .send({
        allowedPages: [AdminPage.ACCOUNTING, AdminPage.ORDERS],
        version: 0,
      })
      .expect(400);
    await request(server)
      .put("/api/v1/admin-page-access/SUPER_ADMIN")
      .set(bearer(tokens.superAdmin))
      .send({ allowedPages: [], version: 0 })
      .expect(400);
  });
});
