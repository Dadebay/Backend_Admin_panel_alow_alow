import { describe, expect, it } from "vitest";
import { validateEnv } from "../src/config/env";

const productionSecrets = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://app:secret@db.example/alowalow",
  REDIS_URL: "rediss://default:secret@redis.example:6379/0",
  JWT_ACCESS_SECRET: "j".repeat(32),
  OTP_PEPPER: "o".repeat(32),
  SMS_PROVIDER: "twilio",
  TWILIO_ACCOUNT_SID: `AC${"a".repeat(32)}`,
  TWILIO_AUTH_TOKEN: "t".repeat(32),
  TWILIO_FROM: "+12025550123",
  CORS_ORIGINS: "https://admin.example.com,https://app.example.com",
};

describe("security environment configuration", () => {
  it("uses the AWS credential chain in production when static keys are absent", () => {
    const env = validateEnv(productionSecrets);

    expect(env.S3_ENDPOINT).toBe("");
    expect(env.S3_ACCESS_KEY_ID).toBe("");
    expect(env.S3_SECRET_ACCESS_KEY).toBe("");
    expect(env.S3_FORCE_PATH_STYLE).toBe(false);
  });

  it("rejects an incomplete static credential pair", () => {
    expect(() =>
      validateEnv({
        ...productionSecrets,
        S3_ACCESS_KEY_ID: "access-key",
      }),
    ).toThrow(
      "S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY must be provided together",
    );
  });

  it("does not allow production to fall back to development secrets", () => {
    expect(() =>
      validateEnv({
        NODE_ENV: "production",
        DATABASE_URL: productionSecrets.DATABASE_URL,
        CORS_ORIGINS: productionSecrets.CORS_ORIGINS,
      }),
    ).toThrow("JWT_ACCESS_SECRET");
  });

  it("requires an explicit production database", () => {
    expect(() =>
      validateEnv({
        ...productionSecrets,
        DATABASE_URL: "",
      }),
    ).toThrow("DATABASE_URL");
  });

  it("requires TLS Redis and a real SMS provider in production", () => {
    expect(() =>
      validateEnv({
        ...productionSecrets,
        REDIS_URL: "redis://redis.example:6379/0",
      }),
    ).toThrow("rediss://");
    expect(() =>
      validateEnv({
        ...productionSecrets,
        SMS_PROVIDER: "console",
      }),
    ).toThrow("must be twilio");
    expect(() =>
      validateEnv({
        ...productionSecrets,
        TWILIO_AUTH_TOKEN: "",
      }),
    ).toThrow("TWILIO_AUTH_TOKEN");
  });

  it("rejects wildcard and insecure production CORS origins", () => {
    expect(() =>
      validateEnv({
        ...productionSecrets,
        CORS_ORIGINS: "*",
      }),
    ).toThrow("explicit origins");
    expect(() =>
      validateEnv({
        ...productionSecrets,
        CORS_ORIGINS: "http://admin.example.com",
      }),
    ).toThrow("not allowed");
  });

  it("rejects invalid environment names and unsafe numeric limits", () => {
    expect(() => validateEnv({ NODE_ENV: "staging" })).toThrow("NODE_ENV");
    expect(() => validateEnv({ PORT: 0 })).toThrow("PORT");
    expect(() => validateEnv({ REFRESH_TOKEN_TTL_DAYS: 365 })).toThrow(
      "REFRESH_TOKEN_TTL_DAYS",
    );
    expect(() => validateEnv({ MAX_IMAGE_BYTES: Number.NaN })).toThrow(
      "MAX_IMAGE_BYTES",
    );
  });
});
