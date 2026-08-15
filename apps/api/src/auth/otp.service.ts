import {
  Injectable,
  HttpException,
  HttpStatus,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac, randomInt, randomUUID } from "node:crypto";
import type { AppEnv } from "../config/env";
import { RedisService } from "../redis/redis.service";

const OTP_TTL_SECONDS = 5 * 60;
const OTP_RESEND_SECONDS = 60;
const OTP_HOURLY_LIMIT = 5;
const OTP_MAX_ATTEMPTS = 5;

const ISSUE_SCRIPT = `
if redis.call("EXISTS", KEYS[2]) == 1 then
  return 0
end
local hourly = redis.call("INCR", KEYS[3])
if hourly == 1 then
  redis.call("EXPIRE", KEYS[3], ARGV[4])
end
if hourly > tonumber(ARGV[5]) then
  return -1
end
redis.call("HSET", KEYS[1],
  "codeHash", ARGV[1],
  "attempts", "0",
  "requestId", ARGV[2]
)
redis.call("EXPIRE", KEYS[1], ARGV[3])
redis.call("SET", KEYS[2], ARGV[2], "EX", ARGV[6])
return 1
`;

const VERIFY_SCRIPT = `
local stored = redis.call("HGET", KEYS[1], "codeHash")
if not stored then
  return -1
end
local attempts = tonumber(redis.call("HGET", KEYS[1], "attempts") or "0")
if attempts >= tonumber(ARGV[2]) then
  redis.call("DEL", KEYS[1])
  return -1
end
if stored ~= ARGV[1] then
  attempts = redis.call("HINCRBY", KEYS[1], "attempts", 1)
  if attempts >= tonumber(ARGV[2]) then
    redis.call("DEL", KEYS[1])
  end
  return 0
end
redis.call("DEL", KEYS[1])
return 1
`;

const CANCEL_SCRIPT = `
if redis.call("HGET", KEYS[1], "requestId") ~= ARGV[1] then
  return 0
end
redis.call("DEL", KEYS[1])
if redis.call("GET", KEYS[2]) == ARGV[1] then
  redis.call("DEL", KEYS[2])
end
return 1
`;

export type OtpVerification = "valid" | "incorrect" | "unavailable";

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private readonly pepper: string;
  private readonly longLivedTestOtp: {
    phone: string;
    code: string;
    expiresAt: number;
  } | null;

  constructor(
    private readonly redis: RedisService,
    config: ConfigService<AppEnv, true>,
  ) {
    this.pepper = config.get("OTP_PEPPER", { infer: true });
    this.longLivedTestOtp = config.get("LONG_LIVED_TEST_OTP_ENABLED", {
      infer: true,
    })
      ? {
          phone: config.get("LONG_LIVED_TEST_OTP_PHONE", { infer: true }),
          code: config.get("LONG_LIVED_TEST_OTP_CODE", { infer: true }),
          expiresAt: Date.parse(
            config.get("LONG_LIVED_TEST_OTP_EXPIRES_AT", { infer: true }),
          ),
        }
      : null;
  }

  async issue(phone: string) {
    const usesLongLivedTestCode = Boolean(
      this.longLivedTestOtp &&
        this.longLivedTestOtp.phone === phone &&
        this.longLivedTestOtp.expiresAt > Date.now(),
    );
    const code = usesLongLivedTestCode
      ? this.longLivedTestOtp!.code
      : String(randomInt(100_000, 1_000_000));
    const requestId = randomUUID();
    const keys = this.keys(phone);
    let result: number;
    try {
      result = await this.redis.evalNumber(
        ISSUE_SCRIPT,
        [keys.challenge, keys.cooldown, keys.hourly],
        [
          this.codeHash(phone, code),
          requestId,
          String(OTP_TTL_SECONDS),
          String(60 * 60),
          String(OTP_HOURLY_LIMIT),
          String(OTP_RESEND_SECONDS),
        ],
      );
    } catch {
      this.logger.error("Could not create an OTP challenge");
      throw new ServiceUnavailableException(
        "Authentication service is temporarily unavailable",
      );
    }

    if (result !== 1) {
      throw new HttpException(
        "Please wait before requesting another code",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return {
      code,
      requestId,
      expiresInSeconds: OTP_TTL_SECONDS,
      usesLongLivedTestCode,
    };
  }

  async verify(phone: string, code: string): Promise<OtpVerification> {
    let result: number;
    try {
      result = await this.redis.evalNumber(
        VERIFY_SCRIPT,
        [this.keys(phone).challenge],
        [this.codeHash(phone, code), String(OTP_MAX_ATTEMPTS)],
      );
    } catch {
      this.logger.error("Could not verify an OTP challenge");
      throw new ServiceUnavailableException(
        "Authentication service is temporarily unavailable",
      );
    }
    if (result === 1) return "valid";
    if (result === 0) return "incorrect";
    return "unavailable";
  }

  async cancel(phone: string, requestId: string) {
    const keys = this.keys(phone);
    try {
      await this.redis.evalNumber(
        CANCEL_SCRIPT,
        [keys.challenge, keys.cooldown],
        [requestId],
      );
    } catch {
      this.logger.error("Could not roll back an undelivered OTP challenge");
    }
  }

  private keys(phone: string) {
    const phoneHash = createHmac("sha256", this.pepper)
      .update(phone)
      .digest("hex");
    return {
      challenge: `alowalow:otp:challenge:${phoneHash}`,
      cooldown: `alowalow:otp:cooldown:${phoneHash}`,
      hourly: `alowalow:otp:hourly:${phoneHash}`,
    };
  }

  private codeHash(phone: string, code: string) {
    return createHmac("sha256", this.pepper)
      .update(`${phone}:${code}`)
      .digest("hex");
  }
}
