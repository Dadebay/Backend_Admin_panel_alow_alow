import { describe, expect, it } from "vitest";
import { validateEnv } from "../src/config/env";

const productionSecrets = {
  NODE_ENV: "production",
  JWT_ACCESS_SECRET: "j".repeat(32),
  OTP_PEPPER: "o".repeat(32),
};

describe("S3 environment configuration", () => {
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
});
