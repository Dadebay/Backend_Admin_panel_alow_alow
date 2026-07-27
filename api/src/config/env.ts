export type AppEnv = {
  NODE_ENV: "development" | "test" | "production";
  PORT: number;
  DATABASE_URL: string;
  JWT_ACCESS_SECRET: string;
  OTP_PEPPER: string;
  ACCESS_TOKEN_TTL: string;
  REFRESH_TOKEN_TTL_DAYS: number;
  CORS_ORIGINS: string;
  UPLOAD_DIR: string;
  MAX_IMAGE_BYTES: number;
};

export function validateEnv(source: Record<string, unknown>): AppEnv {
  const text = (key: string, fallback: string) =>
    typeof source[key] === "string" ? source[key] : fallback;
  const number = (key: string, fallback: number) => {
    const value = source[key];
    return typeof value === "number" || typeof value === "string"
      ? Number(value)
      : fallback;
  };
  const nodeEnv = text(
    "NODE_ENV",
    "development",
  ) as AppEnv["NODE_ENV"];
  const isProduction = nodeEnv === "production";
  const jwtSecret = text(
    "JWT_ACCESS_SECRET",
    "dev-only-jwt-secret-change-before-production",
  );
  const otpPepper = text(
    "OTP_PEPPER",
    "dev-only-otp-pepper-change-before-production",
  );

  if (isProduction && (jwtSecret.length < 32 || otpPepper.length < 32)) {
    throw new Error(
      "JWT_ACCESS_SECRET and OTP_PEPPER must each contain at least 32 characters",
    );
  }

  return {
    NODE_ENV: nodeEnv,
    PORT: number("PORT", 4000),
    DATABASE_URL: text(
      "DATABASE_URL",
      "postgresql://alofood:alofood@localhost:5432/alofood?schema=public",
    ),
    JWT_ACCESS_SECRET: jwtSecret,
    OTP_PEPPER: otpPepper,
    ACCESS_TOKEN_TTL: text("ACCESS_TOKEN_TTL", "15m"),
    REFRESH_TOKEN_TTL_DAYS: number("REFRESH_TOKEN_TTL_DAYS", 30),
    CORS_ORIGINS: text(
      "CORS_ORIGINS",
      "http://localhost:3000,http://localhost:3001",
    ),
    UPLOAD_DIR: text("UPLOAD_DIR", "uploads"),
    MAX_IMAGE_BYTES: number("MAX_IMAGE_BYTES", 5_242_880),
  };
}
