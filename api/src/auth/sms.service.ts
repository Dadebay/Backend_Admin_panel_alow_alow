import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import twilio, { type Twilio } from "twilio";
import type { AppEnv } from "../config/env";

@Injectable()
export class SmsService {
  private readonly provider: AppEnv["SMS_PROVIDER"];
  private readonly from: string;
  private readonly client?: Twilio;

  constructor(config: ConfigService<AppEnv, true>) {
    this.provider = config.get("SMS_PROVIDER", { infer: true });
    this.from = config.get("TWILIO_FROM", { infer: true });
    if (this.provider === "twilio") {
      this.client = twilio(
        config.get("TWILIO_ACCOUNT_SID", { infer: true }),
        config.get("TWILIO_AUTH_TOKEN", { infer: true }),
      );
    }
  }

  async sendOtp(phone: string, code: string) {
    if (this.provider === "console") return;
    if (!this.client) throw new Error("SMS provider is unavailable");

    await this.client.messages.create({
      body: `AlowAlow: код входа ${code}. Никому не сообщайте код.`,
      from: this.from,
      to: phone,
    });
  }
}
