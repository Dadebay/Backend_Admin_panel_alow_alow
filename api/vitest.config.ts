import { defineConfig } from "vitest/config";

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://alofood:alofood@localhost:5432/alofood_test";
const testRedisUrl =
  process.env.TEST_REDIS_URL ?? "redis://localhost:6379/15";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.spec.ts"],
    passWithNoTests: false,
    fileParallelism: false,
    globalSetup: ["./test/global-setup.ts"],
    testTimeout: 20_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: "test",
      DATABASE_URL: testDatabaseUrl,
      REDIS_URL: testRedisUrl,
      JWT_ACCESS_SECRET: "test-jwt-secret-with-at-least-32-characters",
      OTP_PEPPER: "test-otp-pepper-with-at-least-32-characters",
      SMS_PROVIDER: "console",
      CORS_ORIGINS: "http://localhost:3000",
      S3_ENDPOINT: "http://localhost:9000",
      S3_ACCESS_KEY_ID: "alofood",
      S3_SECRET_ACCESS_KEY: "alofood-local-secret",
      S3_FORCE_PATH_STYLE: "true",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      reportsDirectory: "./coverage",
      include: [
        "src/auth/**/*.ts",
        "src/catalog/**/*.ts",
        "src/common/**/*.ts",
        "src/config/**/*.ts",
        "src/orders/**/*.ts",
        "src/users/**/*.ts",
        "src/media/**/*.ts",
        "src/redis/**/*.ts",
        "src/tracking/**/*.ts",
      ],
      exclude: ["src/common/auth.types.ts"],
      thresholds: {
        statements: 75,
        branches: 60,
        functions: 80,
        lines: 78,
      },
    },
  },
});
