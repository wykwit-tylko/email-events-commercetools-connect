export class InvalidCommerceNotificationJsonError extends Error {
  constructor() {
    super("Commerce Notification must be valid JSON for Cloudflare Queue publishing");
    this.name = "InvalidCommerceNotificationJsonError";
  }
}

export type QueueCommerceNotification = Record<string, unknown>;

export function toQueueCommerceNotification(body: Buffer): QueueCommerceNotification {
  try {
    const parsed = JSON.parse(body.toString("utf8")) as unknown;

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new InvalidCommerceNotificationJsonError();
    }

    return parsed as QueueCommerceNotification;
  } catch (error) {
    if (error instanceof InvalidCommerceNotificationJsonError) {
      throw error;
    }
    throw new InvalidCommerceNotificationJsonError();
  }
}
