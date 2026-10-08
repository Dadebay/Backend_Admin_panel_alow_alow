// Isolated browser QA only. Apply migrations to an EMPTY local *_test database
// before starting; this helper never drops or clears an existing database.
import { createRequire } from "node:module";
import { writeFileSync, mkdirSync, chmodSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const path = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const localRequire = createRequire(import.meta.url);
const databaseUrl = process.env.TEST_DATABASE_URL;
const redisUrl = process.env.TEST_REDIS_URL;
const s3Endpoint = process.env.TEST_S3_ENDPOINT;
const isLoopback = (url) =>
  ["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname);
if (
  !databaseUrl ||
  !isLoopback(databaseUrl) ||
  !new URL(databaseUrl).pathname.endsWith("_test") ||
  !redisUrl ||
  !isLoopback(redisUrl) ||
  new URL(redisUrl).pathname !== "/15" ||
  !s3Endpoint ||
  !isLoopback(s3Endpoint)
) {
  throw new Error(
    "Requires local TEST_DATABASE_URL ending in _test, TEST_REDIS_URL DB 15 and TEST_S3_ENDPOINT",
  );
}
const sessionFile = resolve(
  process.env.STAFF_SALES_QA_SESSION ??
    join(tmpdir(), "a7-staff-sales-qa", "session.json"),
);
if (sessionFile.startsWith(resolve(path, "../..") + "/"))
  throw new Error("Keep the QA session outside the repository");
mkdirSync(dirname(sessionFile), { recursive: true });
Object.assign(process.env, {
  NODE_ENV: "test",
  DEPLOYMENT_ENVIRONMENT: "development",
  DATABASE_URL: databaseUrl,
  REDIS_URL: redisUrl,
  JWT_ACCESS_SECRET: "staff-sales-test-only-jwt-secret-for-isolated-fixture",
  OTP_PEPPER: "staff-sales-test-only-otp-pepper-for-isolated-fixture",
  SMS_PROVIDER: "console",
  PUSH_PROVIDER: "console",
  CORS_ORIGINS: "http://127.0.0.1:4174",
  LONG_LIVED_TEST_OTP_ENABLED: "false",
  S3_ENDPOINT: s3Endpoint,
  S3_ACCESS_KEY_ID: "alofood",
  S3_SECRET_ACCESS_KEY: "alofood-local-secret",
  S3_FORCE_PATH_STYLE: "true",
  ROUTING_URL: "http://127.0.0.1:9",
  GEOCODING_PRIMARY_URL: "http://127.0.0.1:9",
  GEOCODING_FALLBACK_URL: "http://127.0.0.1:9",
});
localRequire("reflect-metadata");
const { NestFactory } = localRequire("@nestjs/core");
const { JwtService } = localRequire("@nestjs/jwt");
const { AppModule } = localRequire(path + "/dist/src/app.module.js");
const { configureApp } = localRequire(path + "/dist/src/bootstrap.js");
const { PrismaService } = localRequire(
  path + "/dist/src/prisma/prisma.service.js",
);

(async () => {
  const app = await NestFactory.create(AppModule, { logger: ["error"] });
  configureApp(app);
  await app.init();
  const prisma = app.get(PrismaService);
  if ((await prisma.user.count()) !== 0) {
    await app.close();
    throw new Error("QA database must be empty");
  }
  const admin = await prisma.user.create({
    data: {
      phone: "+99365007701",
      firstName: "Администратор QA",
      role: "ADMIN",
    },
  });
  const owner = await prisma.user.create({
    data: {
      phone: "+99365007702",
      firstName: "Главный администратор QA",
      role: "SUPER_ADMIN",
    },
  });
  const busy = await prisma.user.create({
    data: {
      phone: "+99365007703",
      firstName: "Повар с активным заказом",
      role: "COOK",
    },
  });
  const courier = await prisma.user.create({
    data: { phone: "+99365007704", firstName: "Курьер QA", role: "COURIER" },
  });
  const customer = await prisma.user.create({
    data: { phone: "+99365007705", firstName: "Клиент QA", role: "CUSTOMER" },
  });
  await prisma.accountingSettings.create({ data: { id: "default" } });
  const foods = [155, 205, 475, 100, 620, 185, 24, 310, 69],
    delivery = [25, 15, 20, 15, 30, 15, 35, 40, 30],
    numbers = [27, 23, 22, 21, 20, 1, 6, 5, 7];
  const create = (
    number,
    food,
    fee,
    createdAt,
    cashAt,
    status = "CASH_RETURNED",
  ) =>
    prisma.order.create({
      data: {
        number,
        customerId: customer.id,
        courierId: courier.id,
        status,
        source: "CUSTOMER_APP",
        subtotal: food,
        total: food + fee,
        deliveryFee: fee,
        address: "Ашхабад, тестовый адрес",
        latitude: 37.87,
        longitude: 58.31,
        createdAt: new Date(createdAt),
        ...(cashAt
          ? {
              cashSettlement: {
                create: {
                  courierId: courier.id,
                  amount: food,
                  status: "CONFIRMED",
                  operatorTakenAt: new Date(cashAt),
                },
              },
            }
          : {}),
      },
    });
  for (let i = 0; i < 9; i++)
    await create(
      numbers[i],
      foods[i],
      delivery[i],
      i < 5 ? "2026-10-06T15:00:00Z" : "2026-10-07T07:10:00Z",
      "2026-10-07T08:20:00Z",
    );
  for (let i = 0; i < 26; i++)
    await create(
      100 + i,
      10,
      2,
      "2026-10-07T06:00:00Z",
      "2026-10-07T09:00:00Z",
    );
  await create(888, 800, 0, "2026-10-07T06:00:00Z", null, "CANCELLED");
  await prisma.order.create({
    data: {
      number: 900000,
      customerId: customer.id,
      cookId: busy.id,
      status: "COOKING",
      subtotal: 10,
      total: 10,
      address: "Занятый повар",
      latitude: 37.87,
      longitude: 58.31,
    },
  });
  const accessToken = await app
    .get(JwtService)
    .signAsync({ sub: admin.id, phone: admin.phone, role: admin.role });
  const fixture = {
    session: {
      accessToken,
      refreshToken: "isolated-fixture-refresh-unused",
      accessExpiresAt: Date.now() + 3600000,
      expiresInSeconds: 3600,
      loginMethod: "CENTRAL_OTP",
      user: admin,
    },
    busyStaffId: busy.id,
    ownerId: owner.id,
  };
  writeFileSync(sessionFile, JSON.stringify(fixture), { mode: 0o600 });
  chmodSync(sessionFile, 0o600);
  await app.listen(4015, "127.0.0.1");
  console.info(
    "Isolated staff/sales fixture ready on 127.0.0.1:4015; session file:",
    sessionFile,
  );
  const stop = async () => {
    await app.close();
    process.exit(0);
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
})().catch((error) => {
  console.error(error.name, error.message);
  process.exit(1);
});
