export type AppEnv = {
  NODE_ENV: "development" | "test" | "production";
  PORT: number;
  DATABASE_URL: string;
  REDIS_URL: string;
  ROUTING_URL: string;
  ROUTING_TIMEOUT_MS: number;
  GEOCODING_PRIMARY_URL: string;
  GEOCODING_FALLBACK_URL: string;
  GEOCODING_USER_AGENT: string;
  JWT_ACCESS_SECRET: string;
  OTP_PEPPER: string;
  SMS_PROVIDER: "android_pull" | "console";
  SMS_GATEWAY_DEVICE_ID: string;
  SMS_GATEWAY_DEVICE_TOKEN: string;
  SMS_GATEWAY_ALLOW_UNAUTHENTICATED_LOCAL: boolean;
  SMS_GATEWAY_ENCRYPTION_KEY: string;
  PUSH_PROVIDER: "fcm" | "console";
  FCM_SERVICE_ACCOUNT_BASE64: string;
  PUSH_DISPATCH_INTERVAL_MS: number;
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
  const routingUrl = text("ROUTING_URL", "http://127.0.0.1:5000").replace(
    /\/$/,
    "",
  );
  const geocodingPrimaryUrl = text(
    "GEOCODING_PRIMARY_URL",
    "https://nominatim.openstreetmap.org",
  ).replace(/\/+$/, "");
  const geocodingFallbackUrl = text(
    "GEOCODING_FALLBACK_URL",
    "https://photon.komoot.io",
  ).replace(/\/+$/, "");
  const geocodingUserAgent = text(
    "GEOCODING_USER_AGENT",
    "AlowAlow-Delivery/1.0",
  ).trim();
  const smsProvider = text("SMS_PROVIDER", isProduction ? "" : "console");
  const smsGatewayDeviceId = text(
    "SMS_GATEWAY_DEVICE_ID",
    "android-primary",
  ).trim();
  const smsGatewayDeviceToken = text("SMS_GATEWAY_DEVICE_TOKEN", "");
  const allowUnauthenticatedLocalGateway = boolean(
    "SMS_GATEWAY_ALLOW_UNAUTHENTICATED_LOCAL",
    false,
  );
  const smsGatewayEncryptionKey = text("SMS_GATEWAY_ENCRYPTION_KEY", "");
  const pushProvider = text("PUSH_PROVIDER", isProduction ? "fcm" : "console");
  const fcmServiceAccountBase64 = text("FCM_SERVICE_ACCOUNT_BASE64", "");

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
  let parsedRoutingUrl: URL;
  try {
    parsedRoutingUrl = new URL(routingUrl);
  } catch {
    throw new Error("ROUTING_URL must be a valid HTTP URL");
  }
  if (
    !["http:", "https:"].includes(parsedRoutingUrl.protocol) ||
    parsedRoutingUrl.username ||
    parsedRoutingUrl.password ||
    parsedRoutingUrl.search ||
    parsedRoutingUrl.hash ||
    (parsedRoutingUrl.pathname !== "/" && parsedRoutingUrl.pathname !== "")
  ) {
    throw new Error(
      "ROUTING_URL must be an HTTP origin without credentials, path, query or fragment",
    );
  }
  for (const [key, value] of [
    ["GEOCODING_PRIMARY_URL", geocodingPrimaryUrl],
    ["GEOCODING_FALLBACK_URL", geocodingFallbackUrl],
  ] as const) {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new Error(`${key} must be a valid HTTP URL`);
    }
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash
    ) {
      throw new Error(
        `${key} must be an HTTP URL without credentials, query or fragment`,
      );
    }
  }
  if (
    geocodingUserAgent.length < 8 ||
    geocodingUserAgent.length > 160 ||
    /[\r\n]/.test(geocodingUserAgent)
  ) {
    throw new Error(
      "GEOCODING_USER_AGENT must contain 8 to 160 safe characters",
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
  if (!["android_pull", "console"].includes(smsProvider)) {
    throw new Error("SMS_PROVIDER must be android_pull or console");
  }
  if (isProduction && smsProvider === "console") {
    throw new Error("SMS_PROVIDER must not be console in production");
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/.test(smsGatewayDeviceId)) {
    throw new Error(
      "SMS_GATEWAY_DEVICE_ID must contain 3 to 64 safe characters",
    );
  }
  if (allowUnauthenticatedLocalGateway && nodeEnv !== "development") {
    throw new Error(
      "SMS_GATEWAY_ALLOW_UNAUTHENTICATED_LOCAL is only allowed in development",
    );
  }
  if (
    smsProvider === "android_pull" &&
    !allowUnauthenticatedLocalGateway &&
    smsGatewayDeviceToken.length < 32
  ) {
    throw new Error(
      "SMS_GATEWAY_DEVICE_TOKEN must contain at least 32 characters for Android pull SMS",
    );
  }
  if (
    smsProvider === "android_pull" &&
    Buffer.from(smsGatewayEncryptionKey, "base64").length !== 32
  ) {
    throw new Error(
      "SMS_GATEWAY_ENCRYPTION_KEY must be a base64-encoded 32-byte key for Android pull SMS",
    );
  }
  if (!["fcm", "console"].includes(pushProvider)) {
    throw new Error("PUSH_PROVIDER must be fcm or console");
  }
  if (isProduction && pushProvider === "console") {
    throw new Error("PUSH_PROVIDER must not be console in production");
  }
  if (pushProvider === "fcm") {
    let serviceAccount: unknown;
    try {
      serviceAccount = JSON.parse(
        Buffer.from(fcmServiceAccountBase64, "base64").toString("utf8"),
      );
    } catch {
      throw new Error(
        "FCM_SERVICE_ACCOUNT_BASE64 must contain base64-encoded service account JSON",
      );
    }
    const account = serviceAccount as Record<string, unknown> | null;
    if (
      !account ||
      typeof account !== "object" ||
      typeof account.project_id !== "string" ||
      !account.project_id.trim() ||
      typeof account.client_email !== "string" ||
      !account.client_email.trim() ||
      typeof account.private_key !== "string" ||
      !account.private_key.trim()
    ) {
      throw new Error(
        "FCM service account must include project_id, client_email and private_key",
      );
    }
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
  const routingTimeoutMs = number("ROUTING_TIMEOUT_MS", 3_000);
  if (
    !Number.isInteger(routingTimeoutMs) ||
    routingTimeoutMs < 500 ||
    routingTimeoutMs > 10_000
  ) {
    throw new Error(
      "ROUTING_TIMEOUT_MS must be an integer between 500 and 10000",
    );
  }
  const pushDispatchIntervalMs = number("PUSH_DISPATCH_INTERVAL_MS", 5_000);
  if (
    !Number.isInteger(pushDispatchIntervalMs) ||
    pushDispatchIntervalMs < 1_000 ||
    pushDispatchIntervalMs > 60_000
  ) {
    throw new Error(
      "PUSH_DISPATCH_INTERVAL_MS must be an integer between 1000 and 60000",
    );
  }

  const corsOrigins = text(
    "CORS_ORIGINS",
    isProduction ? "" : "http://localhost:5173,http://localhost:3000",
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
    ROUTING_URL: routingUrl,
    ROUTING_TIMEOUT_MS: routingTimeoutMs,
    GEOCODING_PRIMARY_URL: geocodingPrimaryUrl,
    GEOCODING_FALLBACK_URL: geocodingFallbackUrl,
    GEOCODING_USER_AGENT: geocodingUserAgent,
    JWT_ACCESS_SECRET: jwtSecret,
    OTP_PEPPER: otpPepper,
    SMS_PROVIDER: smsProvider as AppEnv["SMS_PROVIDER"],
    SMS_GATEWAY_DEVICE_ID: smsGatewayDeviceId,
    SMS_GATEWAY_DEVICE_TOKEN: smsGatewayDeviceToken,
    SMS_GATEWAY_ALLOW_UNAUTHENTICATED_LOCAL: allowUnauthenticatedLocalGateway,
    SMS_GATEWAY_ENCRYPTION_KEY: smsGatewayEncryptionKey,
    PUSH_PROVIDER: pushProvider as AppEnv["PUSH_PROVIDER"],
    FCM_SERVICE_ACCOUNT_BASE64: fcmServiceAccountBase64,
    PUSH_DISPATCH_INTERVAL_MS: pushDispatchIntervalMs,
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
