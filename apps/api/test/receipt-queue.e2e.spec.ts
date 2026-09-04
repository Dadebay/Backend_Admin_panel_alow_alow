import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import { randomUUID } from "node:crypto";
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
import { Role } from "../src/generated/prisma/client";
import { PrismaService } from "../src/prisma/prisma.service";
import { OrdersService } from "../src/orders/orders.service";
import type {
  ReceiptClaimResponseDto,
  ReceiptClaimResultDto,
  ReceiptTaskResponseDto,
} from "../src/orders/receipt-queue.dto";

const root = "/api/v1/receipt-print-tasks";
describe("durable receipt queue", () => {
  let app: INestApplication,
    prisma: PrismaService,
    server: Parameters<typeof request>[0];
  const tokens = {} as Record<Role, string>;
  let productId: string;
  const station = randomUUID();
  const otherStation = randomUUID();
  const auth = (role: Role = Role.ADMIN) => ({
    Authorization: `Bearer ${tokens[role]}`,
  });
  const body = () => ({
    items: [{ productId, quantity: 1 }],
    address: "Queue test address",
    latitude: 37.98,
    longitude: 58.34,
    idempotencyKey: randomUUID(),
  });
  const create = async (assisted = false, input = body()) => {
    const response = await request(server)
      .post(`/api/v1/orders${assisted ? "/assisted" : ""}`)
      .set(auth(assisted ? Role.OPERATOR : Role.CUSTOMER))
      .send({
        ...input,
        ...(assisted ? { customerPhone: "+99365000805" } : {}),
      })
      .expect(201);
    return response.body as { id: string; number: number; version: number };
  };
  const claim = async (stationId = station, role: Role = Role.ADMIN) => {
    const response = await request(server)
      .post(`${root}/claim`)
      .set(auth(role))
      .send({ stationId })
      .expect(201);
    return (response.body as ReceiptClaimResultDto).task;
  };
  const outcome = (
    task: ReceiptClaimResponseDto,
    value: string,
    role: Role = Role.ADMIN,
  ) =>
    request(server).post(`${root}/${task.id}/outcome`).set(auth(role)).send({
      stationId: task.stationId,
      claimToken: task.claimToken,
      outcome: value,
    });
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    server = app.getHttpServer() as Parameters<typeof request>[0];
    const jwt = app.get(JwtService);
    for (const [i, role] of Object.values(Role).entries()) {
      const user = await prisma.user.create({
        data: {
          phone: `+993650008${String(i + 10).padStart(2, "0")}`,
          role,
          firstName: "Queue test",
        },
      });
      tokens[role] = await jwt.signAsync({
        sub: user.id,
        phone: user.phone,
        role,
      });
    }
    await prisma.branch.create({
      data: {
        name: "Queue test branch",
        address: "Queue test",
        latitude: 37.98,
        longitude: 58.34,
      },
    });
    const category = await prisma.category.create({
      data: {
        name: "Queue test",
        slug: "queue-test",
        receiptPrinterIp: "192.168.0.86",
      },
    });
    const product = await prisma.product.create({
      data: {
        categoryId: category.id,
        name: "Queue dish",
        slug: "queue-dish",
        description: "Queue test",
        price: 10,
      },
    });
    productId = product.id;
  });
  beforeEach(async () => {
    // All test files share only the isolated test DB, run serially. Historical
    // tasks are terminal so each claim exercise has a deterministic backlog.
    await prisma.receiptPrintTask.updateMany({ data: { status: "DELIVERED" } });
  });
  afterAll(async () => {
    await app.close();
  });
  it("enqueues customer/API and assisted orders atomically with frozen routes", async () => {
    const order = await create();
    const phone = await create(true);
    const tasks = await prisma.receiptPrintTask.findMany({
      where: { orderId: { in: [order.id, phone.id] } },
    });
    expect(tasks).toHaveLength(2);
    expect(tasks.every((t) => t.status === "PENDING")).toBe(true);
    const task = await claim();
    expect(task?.orderId).toBe(order.id);
    expect(task?.plan.jobs[0].printerIp).toBe("192.168.0.86");
    await prisma.product.update({
      where: { id: productId },
      data: { receiptPrinterIp: "192.168.0.87" },
    });
    expect(
      (
        await prisma.receiptPrintTask.findUniqueOrThrow({
          where: { id: task!.id },
        })
      ).plan,
    ).toEqual(task!.plan);
    await prisma.product.update({
      where: { id: productId },
      data: { receiptPrinterIp: null },
    });
    const spy = vi
      .spyOn(app.get(OrdersService), "enqueueReceipt")
      .mockRejectedValueOnce(new Error("simulated outbox failure"));
    const before = await prisma.order.count();
    await request(server)
      .post("/api/v1/orders")
      .set(auth(Role.CUSTOMER))
      .send(body())
      .expect(500);
    spy.mockRestore();
    expect(await prisma.order.count()).toBe(before);
  });
  it("deduplicates concurrent creation including nested item content", async () => {
    const input = body();
    const [a, b] = await Promise.all([
      create(false, input),
      create(false, input),
    ]);
    expect(a.id).toBe(b.id);
    expect(
      await prisma.receiptPrintTask.count({ where: { orderId: a.id } }),
    ).toBe(1);
    await request(server)
      .post("/api/v1/orders")
      .set(auth(Role.CUSTOMER))
      .send({ ...input, items: [{ productId, quantity: 2 }] })
      .expect(409);
    const assisted = body();
    const [c, d] = await Promise.all([
      create(true, assisted),
      create(true, assisted),
    ]);
    expect(c.id).toBe(d.id);
    expect(
      await prisma.receiptPrintTask.count({ where: { orderId: c.id } }),
    ).toBe(1);
  });
  it("returns the committed order when a racing retry sees changed availability", async () => {
    const input = body();
    const order = await create(false, input);
    // The retry's initial read raced the first commit; availability then changed.
    const lookup = vi
      .spyOn(prisma.orderCreationRequest, "findUnique")
      .mockResolvedValueOnce(null);
    await prisma.product.update({
      where: { id: productId },
      data: { isActive: false },
    });
    try {
      const retried = await create(false, input);
      expect(retried.id).toBe(order.id);
      expect(
        await prisma.receiptPrintTask.count({ where: { orderId: order.id } }),
      ).toBe(1);
    } finally {
      lookup.mockRestore();
      await prisma.product.update({
        where: { id: productId },
        data: { isActive: true },
      });
    }
  });
  it("leases once across competing tabs/stations and rejects foreign acknowledgments", async () => {
    await create();
    await create();
    const results = await Promise.all([claim(), claim(otherStation)]);
    const tasks = results.filter(
      (task): task is ReceiptClaimResponseDto => task !== null,
    );
    expect(tasks).toHaveLength(1);
    const task = tasks[0];
    await outcome(task, "DELIVERED", Role.OPERATOR).expect(409);
    await request(server)
      .post(`${root}/${task.id}/outcome`)
      .set(auth())
      .send({
        stationId: task.stationId,
        claimToken: randomUUID(),
        outcome: "DELIVERED",
      })
      .expect(409);
    await request(server)
      .post(`${root}/${task.id}/heartbeat`)
      .set(auth())
      .send({ stationId: task.stationId, claimToken: task.claimToken })
      .expect(201);
    await outcome(task, "DELIVERED").expect(201);
    await outcome(task, "DELIVERED").expect(201);
    expect((await claim())?.id).not.toBe(task.id);
  });
  it("keeps the identity through indefinite offline retries and expired leases", async () => {
    await create();
    const first = (await claim())!;
    await outcome(first, "RETRY").expect(201);
    expect(await claim()).toBeNull();
    await request(server)
      .post(`${root}/${first.id}/retry`)
      .set(auth())
      .expect(201);
    expect(await claim(otherStation)).toBeNull();
    const second = (await claim())!;
    expect(second.dispatchId).toBe(first.dispatchId);
    expect(second.plan).toEqual(first.plan);
    expect(second.claimToken).not.toBe(first.claimToken);
    await outcome(first, "DELIVERED").expect(409);
    await prisma.receiptPrintTask.update({
      where: { id: second.id },
      data: { leaseExpiresAt: new Date(Date.now() - 1000), attempts: 99 },
    });
    expect(await claim(otherStation)).toBeNull();
    const recovered = (await claim())!;
    expect(recovered.dispatchId).toBe(first.dispatchId);
    expect(recovered.attempts).toBe(100);
    await outcome(recovered, "RETRY").expect(201);
    const saved = await prisma.receiptPrintTask.findUniqueOrThrow({
      where: { id: recovered.id },
    });
    expect(saved.status).toBe("PENDING");
    expect(saved.nextAttemptAt.getTime() - Date.now()).toBeLessThanOrEqual(
      60_000,
    );
  });
  it("stops ambiguous sends and gives deliberate reprints a new, idempotent identity", async () => {
    const order = await create();
    const first = (await claim())!;
    await outcome(first, "UNCERTAIN").expect(201);
    expect(await claim()).toBeNull();
    await request(server)
      .post(`${root}/${first.id}/retry`)
      .set(auth())
      .expect(409);
    const key = randomUUID();
    const repeat = () =>
      request(server)
        .post(`${root}/orders/${order.id}/reprint`)
        .set(auth())
        .send({ idempotencyKey: key })
        .expect(201);
    const [a, b] = await Promise.all([repeat(), repeat()]);
    expect((a.body as ReceiptTaskResponseDto).id).toBe(
      (b.body as ReceiptTaskResponseDto).id,
    );
    const reprint = (await claim())!;
    expect(reprint.dispatchId).not.toBe(first.dispatchId);
    const other = await create();
    await request(server)
      .post(`${root}/orders/${other.id}/reprint`)
      .set(auth())
      .send({ idempotencyKey: key })
      .expect(409);
    const list = await request(server).get(root).set(auth()).expect(200);
    expect(list.body).toMatchObject({ needsAttention: 1 });
    expect(JSON.stringify(list.body)).not.toContain("Queue test address");
  });
  it("queues cancellation after commit and never creates a second cancellation task", async () => {
    const order = await create();
    await request(server)
      .patch(`/api/v1/orders/${order.id}/cancel`)
      .set(auth())
      .send({ version: order.version, reason: "Queue cancellation" })
      .expect(200);
    const tasks = await prisma.receiptPrintTask.findMany({
      where: { orderId: order.id },
      orderBy: { sequence: "asc" },
    });
    expect(tasks.map((t) => t.documentType)).toEqual(["ORDER", "CANCELLATION"]);
    await request(server)
      .patch(`/api/v1/orders/${order.id}/cancel`)
      .set(auth())
      .send({ version: order.version, reason: "Queue cancellation" })
      .expect(409);
    expect(
      await prisma.receiptPrintTask.count({ where: { orderId: order.id } }),
    ).toBe(2);
  });
  it("denies forbidden roles on every queue mutation and validates payloads", async () => {
    const order = await create();
    const task = (await claim())!;
    const unauthenticated = await request(server).get(root);
    expect(unauthenticated.status, JSON.stringify(unauthenticated.body)).toBe(
      401,
    );
    for (const role of [
      Role.CUSTOMER,
      Role.COOK,
      Role.COURIER,
      Role.ACCOUNTANT,
    ]) {
      await request(server).get(root).set(auth(role)).expect(403);
      await request(server)
        .post(`${root}/claim`)
        .set(auth(role))
        .send({ stationId: station })
        .expect(403);
      await outcome(task, "DELIVERED", role).expect(403);
      await request(server)
        .post(`${root}/${task.id}/heartbeat`)
        .set(auth(role))
        .send({ stationId: station, claimToken: task.claimToken })
        .expect(403);
      await request(server)
        .post(`${root}/${task.id}/retry`)
        .set(auth(role))
        .expect(403);
      await request(server)
        .post(`${root}/orders/${order.id}/reprint`)
        .set(auth(role))
        .send({ idempotencyKey: randomUUID() })
        .expect(403);
    }
    for (const role of [Role.ADMIN, Role.OPERATOR, Role.SUPER_ADMIN])
      await request(server).get(root).set(auth(role)).expect(200);
    await request(server)
      .post(`${root}/claim`)
      .set(auth())
      .send({ stationId: "bad" })
      .expect(400);
    await outcome(task, "PRINTED").expect(400);
    await request(server)
      .post(`${root}/${randomUUID()}/outcome`)
      .set(auth())
      .send({
        stationId: station,
        claimToken: task.claimToken,
        outcome: "DELIVERED",
      })
      .expect(404);
  });
});
