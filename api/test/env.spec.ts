import { describe, expect, it } from "vitest";
import { validateEnv } from "../src/config/env";

const productionSecrets = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://app:secret@db.example/alowalow",
  JWT_ACCESS_SECRET: "j".repeat(32),
  OTP_PEPPER: "o".repeat(32),
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
