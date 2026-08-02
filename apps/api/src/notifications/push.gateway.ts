import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  cert,
  getApps,
  initializeApp,
  type App,
  type ServiceAccount,
} from "firebase-admin/app";
import { getMessaging, type Message } from "firebase-admin/messaging";
import type { AppEnv } from "../config/env";

export type PushTarget = {
  deliveryId: string;
  installationId: string;
  notificationId: string;
};

export type PushPayload = {
  campaignId: string;
  title: string;
  body: string;
  deepLink: string | null;
};

export type PushResult = {
  deliveryId: string;
  ok: boolean;
  providerMessageId: string | null;
  errorCode: string | null;
  invalidInstallation: boolean;
};

const FCM_APP_NAME = "alowalow-push";
const FCM_BATCH_SIZE = 500;

function errorCode(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code.slice(0, 160);
  }
  return "messaging/unknown-error";
}

function isInvalidInstallation(code: string) {
  return [
    "messaging/installation-id-not-registered",
    "messaging/registration-token-not-registered",
    "messaging/invalid-registration-token",
  ].includes(code);
}

@Injectable()
export class PushGateway {
  private readonly logger = new Logger(PushGateway.name);
  private app: App | null = null;

  constructor(private readonly config: ConfigService<AppEnv, true>) {}

  async send(
    payload: PushPayload,
    targets: PushTarget[],
  ): Promise<PushResult[]> {
    if (!targets.length) return [];
    if (this.config.get("PUSH_PROVIDER", { infer: true }) === "console") {
      this.logger.log(
        `Development push ${payload.campaignId} accepted for ${targets.length} installation(s)`,
      );
      return targets.map((target) => ({
        deliveryId: target.deliveryId,
        ok: true,
        providerMessageId: `console:${target.deliveryId}`,
        errorCode: null,
        invalidInstallation: false,
      }));
    }

    const messaging = getMessaging(this.getFcmApp());
    const results: PushResult[] = [];
    for (let offset = 0; offset < targets.length; offset += FCM_BATCH_SIZE) {
      const batch = targets.slice(offset, offset + FCM_BATCH_SIZE);
      const messages: Message[] = batch.map((target) => ({
        fid: target.installationId,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        data: {
          campaignId: payload.campaignId,
          notificationId: target.notificationId,
          ...(payload.deepLink ? { deepLink: payload.deepLink } : {}),
        },
        android: {
          priority: "high",
          notification: {
            channelId: "alowalow_general",
            sound: "default",
          },
        },
      }));

      try {
        const response = await messaging.sendEach(messages);
        response.responses.forEach((item, index) => {
          const target = batch[index];
          if (!target) return;
          const code = item.success ? null : errorCode(item.error);
          results.push({
            deliveryId: target.deliveryId,
            ok: item.success,
            providerMessageId: item.success ? (item.messageId ?? null) : null,
            errorCode: code,
            invalidInstallation: code ? isInvalidInstallation(code) : false,
          });
        });
      } catch (error) {
        const code = errorCode(error);
        this.logger.error(
          `FCM batch failed for campaign ${payload.campaignId}: ${code}`,
        );
        results.push(
          ...batch.map((target) => ({
            deliveryId: target.deliveryId,
            ok: false,
            providerMessageId: null,
            errorCode: code,
            invalidInstallation: isInvalidInstallation(code),
          })),
        );
      }
    }
    return results;
  }

  private getFcmApp() {
    if (this.app) return this.app;
    const existing = getApps().find(({ name }) => name === FCM_APP_NAME);
    if (existing) {
      this.app = existing;
      return existing;
    }
    const encoded = this.config.get("FCM_SERVICE_ACCOUNT_BASE64", {
      infer: true,
    });
    const json = JSON.parse(
      Buffer.from(encoded, "base64").toString("utf8"),
    ) as {
      project_id: string;
      client_email: string;
      private_key: string;
    };
    const serviceAccount: ServiceAccount = {
      projectId: json.project_id,
      clientEmail: json.client_email,
      privateKey: json.private_key,
    };
    this.app = initializeApp(
      { credential: cert(serviceAccount) },
      FCM_APP_NAME,
    );
    return this.app;
  }
}
