export type AppEnv = {
  NODE_ENV: "development" | "test" | "production";
  PORT: number;
  DATABASE_URL: string;
  REDIS_URL: string;
  JWT_ACCESS_SECRET: string;
  OTP_PEPPER: string;
  SMS_PROVIDER: "console" | "twilio";
  TWILIO_ACCOUNT_SID: string;
  TWILIO_AUTH_TOKEN: string;
  TWILIO_FROM: string;
  ACCESS_TOKEN_TTL: string;
  REFRESH_TOKEN_TTL_DAYS: number;
  CORS_ORIGINS: string;
  MAX_IMAGE_BYTES: number;
  S3_REGION: string;
  S3_BUCKET: string;
  S3_ENDPOINT: string;
  S3_ACCESS_KEY_ID: string;
  S3_SECRET_ACCESS_KEY: string;
  S3_FORCE_PATH_STYLE: boolean;
};

export function validateEnv(source: Record<string, unknown>): AppEnv {
  const text = (key: string, fallback: string) =>
    typeof source[key] === "string" ? source[key] : fallback;
  const number = (key: string, fallback: number) => {
    const value = source[key];
    const parsed =
      typeof value === "number" || typeof value === "string"
        ? Number(value)
        : fallback;
    if (!Number.isFinite(parsed)) {
      throw new Error(`${key} must be a finite number`);
    }
    return parsed;
  };
  const boolean = (key: string, fallback: boolean) => {
    const value = source[key];
    if (typeof value === "boolean") return value;
    if (typeof value === "string") return value.toLowerCase() === "true";
    return fallback;
  };
  const nodeEnv = text("NODE_ENV", "development");
  if (!["development", "test", "production"].includes(nodeEnv)) {
    throw new Error("NODE_ENV must be development, test or production");
  }
  const isProduction = nodeEnv === "production";
  const databaseUrl = text(
    "DATABASE_URL",
    isProduction
      ? ""
      : "postgresql://alofood:alofood@localhost:5432/alofood?schema=public",
  );
  const jwtSecret = text(
    "JWT_ACCESS_SECRET",
    isProduction ? "" : "dev-only-jwt-secret-change-before-production",
  );
  const otpPepper = text(
    "OTP_PEPPER",
    isProduction ? "" : "dev-only-otp-pepper-change-before-production",
  );
  const redisUrl = text(
    "REDIS_URL",
    isProduction ? "" : "redis://localhost:6379/0",
  );
  const smsProvider = text(
    "SMS_PROVIDER",
    isProduction ? "" : "console",
  );
  const twilioAccountSid = text("TWILIO_ACCOUNT_SID", "");
  const twilioAuthToken = text("TWILIO_AUTH_TOKEN", "");
  const twilioFrom = text("TWILIO_FROM", "");

  if (
    isProduction &&
    (!databaseUrl ||
      !redisUrl ||
      jwtSecret.length < 32 ||
      otpPepper.length < 32)
  ) {
    throw new Error(
      "DATABASE_URL and REDIS_URL are required and JWT_ACCESS_SECRET and OTP_PEPPER must each contain at least 32 characters",
    );
  }
  if (
    !databaseUrl.startsWith("postgresql://") &&
    !databaseUrl.startsWith("postgres://")
  ) {
    throw new Error("DATABASE_URL must be a PostgreSQL URL");
  }
  let parsedRedisUrl: URL;
  try {
    parsedRedisUrl = new URL(redisUrl);
  } catch {
    throw new Error("REDIS_URL must be a valid Redis URL");
  }
  if (
    !["redis:", "rediss:"].includes(parsedRedisUrl.protocol) ||
    (isProduction && parsedRedisUrl.protocol !== "rediss:")
  ) {
    throw new Error(
      "REDIS_URL must use redis:// locally and rediss:// in production",
    );
  }
  if (!["console", "twilio"].includes(smsProvider)) {
    throw new Error("SMS_PROVIDER must be console or twilio");
  }
  if (isProduction && smsProvider !== "twilio") {
    throw new Error("SMS_PROVIDER must be twilio in production");
  }
  if (
    smsProvider === "twilio" &&
    (!/^AC[0-9a-fA-F]{32}$/.test(twilioAccountSid) ||
      twilioAuthToken.length < 32 ||
      !twilioFrom)
  ) {
    throw new Error(
      "TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM are required for Twilio SMS",
    );
  }

  const port = number("PORT", 4000);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }
  const refreshTokenTtlDays = number("REFRESH_TOKEN_TTL_DAYS", 30);
  if (
    !Number.isInteger(refreshTokenTtlDays) ||
    refreshTokenTtlDays < 1 ||
    refreshTokenTtlDays > 90
  ) {
    throw new Error(
      "REFRESH_TOKEN_TTL_DAYS must be an integer between 1 and 90",
    );
  }
  const maxImageBytes = number("MAX_IMAGE_BYTES", 5_242_880);
  if (
    !Number.isInteger(maxImageBytes) ||
    maxImageBytes < 1 ||
    maxImageBytes > 10_485_760
  ) {
    throw new Error(
      "MAX_IMAGE_BYTES must be an integer between 1 and 10485760",
    );
  }

  const corsOrigins = text(
    "CORS_ORIGINS",
    isProduction ? "" : "http://localhost:3000,http://localhost:3001",
  );
  const origins = corsOrigins
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (!origins.length || origins.includes("*")) {
    throw new Error("CORS_ORIGINS must contain explicit origins");
  }
  for (const origin of origins) {
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error(`CORS origin is invalid: ${origin}`);
    }
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.origin !== origin ||
      (isProduction && parsed.protocol !== "https:")
    ) {
      throw new Error(`CORS origin is not allowed: ${origin}`);
    }
  }
  const s3AccessKeyId = text("S3_ACCESS_KEY_ID", isProduction ? "" : "alofood");
  const s3SecretAccessKey = text(
    "S3_SECRET_ACCESS_KEY",
    isProduction ? "" : "alofood-local-secret",
  );
  if (Boolean(s3AccessKeyId) !== Boolean(s3SecretAccessKey)) {
    throw new Error(
      "S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY must be provided together",
    );
  }
  const s3Bucket = text("S3_BUCKET", "alowalow-media");
  if (!s3Bucket) throw new Error("S3_BUCKET is required");

  return {
    NODE_ENV: nodeEnv as AppEnv["NODE_ENV"],
    PORT: port,
    DATABASE_URL: databaseUrl,
    REDIS_URL: redisUrl,
    JWT_ACCESS_SECRET: jwtSecret,
    OTP_PEPPER: otpPepper,
    SMS_PROVIDER: smsProvider as AppEnv["SMS_PROVIDER"],
    TWILIO_ACCOUNT_SID: twilioAccountSid,
    TWILIO_AUTH_TOKEN: twilioAuthToken,
    TWILIO_FROM: twilioFrom,
    ACCESS_TOKEN_TTL: text("ACCESS_TOKEN_TTL", "15m"),
    REFRESH_TOKEN_TTL_DAYS: refreshTokenTtlDays,
    CORS_ORIGINS: origins.join(","),
    MAX_IMAGE_BYTES: maxImageBytes,
    S3_REGION: text("S3_REGION", "us-east-1"),
    S3_BUCKET: s3Bucket,
    S3_ENDPOINT: text(
      "S3_ENDPOINT",
      isProduction ? "" : "http://localhost:9000",
    ),
    S3_ACCESS_KEY_ID: s3AccessKeyId,
    S3_SECRET_ACCESS_KEY: s3SecretAccessKey,
    S3_FORCE_PATH_STYLE: boolean("S3_FORCE_PATH_STYLE", !isProduction),
  };
}
