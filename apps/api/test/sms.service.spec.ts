import type { ConfigService } from "@nestjs/config";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../src/config/env";
import type { SmsGatewayService } from "../src/auth/sms-gateway.service";

const mocks = vi.hoisted(() => ({
  createMessage: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("twilio", () => ({
  default: mocks.createClient,
}));

import { SmsService } from "../src/auth/sms.service";

function config(values: Partial<AppEnv>) {
  return {
    get: (key: keyof AppEnv) => values[key],
  } as ConfigService<AppEnv, true>;
}

describe("SMS delivery", () => {
  const enqueueOtp = vi.fn();
  const gateway = {
    enqueueOtp,
  } as unknown as SmsGatewayService;

  beforeEach(() => {
    mocks.createMessage.mockReset();
    mocks.createClient.mockReset();
    enqueueOtp.mockReset();
    mocks.createClient.mockReturnValue({
      messages: { create: mocks.createMessage },
    });
  });

  it("sends the OTP to the normalized phone through Twilio", async () => {
    mocks.createMessage.mockResolvedValue({ sid: "SM-test" });
    const service = new SmsService(
      config({
        SMS_PROVIDER: "twilio",
        TWILIO_ACCOUNT_SID: `AC${"a".repeat(32)}`,
        TWILIO_AUTH_TOKEN: "t".repeat(32),
        TWILIO_FROM: "+12025550123",
      }),
      gateway,
    );

    await service.sendOtp(
      "+99365123456",
      "123456",
      "request-id",
      300,
    );

    expect(mocks.createClient).toHaveBeenCalledWith(
      `AC${"a".repeat(32)}`,
      "t".repeat(32),
    );
    expect(mocks.createMessage).toHaveBeenCalledWith({
      body: "AlowAlow: код входа 123456. Никому не сообщайте код.",
      from: "+12025550123",
      to: "+99365123456",
    });
  });

  it("does not contact Twilio in local console mode", async () => {
    const service = new SmsService(
      config({
        SMS_PROVIDER: "console",
        TWILIO_FROM: "",
      }),
      gateway,
    );

    await service.sendOtp(
      "+99365123456",
      "123456",
      "request-id",
      300,
    );

    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.createMessage).not.toHaveBeenCalled();
  });

  it("queues OTP delivery for the authenticated Android pull gateway", async () => {
    enqueueOtp.mockResolvedValue({ id: "job-id" });
    const service = new SmsService(
      config({
        SMS_PROVIDER: "android_pull",
        TWILIO_FROM: "",
      }),
      gateway,
    );

    await service.sendOtp(
      "+99365123456",
      "123456",
      "request-id",
      300,
    );

    expect(enqueueOtp).toHaveBeenCalledWith(
      "+99365123456",
      "123456",
      "request-id",
      300,
    );
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});
