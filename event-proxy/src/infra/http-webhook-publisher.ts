import type {
  CommerceNotificationPublisher,
  PublishOptions,
} from "./commerce-notification-publisher.js";
import { sha256Hex } from "../shared/hmac.js";
import {
  signWebhook,
  WEBHOOK_ID_HEADER,
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_TIMESTAMP_HEADER,
} from "../shared/webhook-signing.js";

/**
 * Outbound Publisher that POSTs a Commerce Notification to an HTTP endpoint
 * (the shelfmarket store backend) as a signed Email Event. It does not
 * interpret the notification; it only adapts it to the wire format required by
 * the endpoint — a JSON body plus an HMAC signature and replay headers.
 */
export class HttpWebhookPublisher implements CommerceNotificationPublisher {
  constructor(
    private readonly options: {
      endpointUrl: string;
      emailEventSecret: string;
      timeoutMs: number;
    },
  ) {}

  async publish(payload: unknown, _options?: PublishOptions): Promise<void> {
    const body = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const messageId = await resolveMessageId(payload, body);
    const signature = await signWebhook(this.options.emailEventSecret, {
      timestamp,
      messageId,
      body,
    });

    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), this.options.timeoutMs);

    try {
      const response = await fetch(this.options.endpointUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [WEBHOOK_TIMESTAMP_HEADER]: timestamp,
          [WEBHOOK_ID_HEADER]: messageId,
          [WEBHOOK_SIGNATURE_HEADER]: signature,
        },
        body,
        signal: abortController.signal,
      });

      if (!response.ok) {
        const responseBody = await readErrorBody(response);
        throw new Error(
          `HTTP webhook publish to ${this.options.endpointUrl} failed with ${response.status}: ${responseBody}`,
        );
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  async close(): Promise<void> {
    return;
  }

  isReady(): boolean {
    return true;
  }
}

/**
 * Resolve the delivery id used for signing and replay dedupe. Prefers the
 * Commerce Notification's own `id` (stable across commercetools redeliveries);
 * falls back to a content digest so identical retries still dedupe when no id
 * is present.
 */
async function resolveMessageId(payload: unknown, body: string): Promise<string> {
  if (payload && typeof payload === "object" && "id" in payload) {
    const id = (payload as Record<string, unknown>).id;
    if (typeof id === "string" && id.length > 0) {
      return id;
    }
  }
  return sha256Hex(body);
}

const ERROR_BODY_READ_TIMEOUT_MS = 1000;
const MAX_ERROR_BODY_BYTES = 2048;

/**
 * Reads an error response body with a hard timeout and size cap, so a slow or
 * malicious endpoint cannot hang the publisher or exhaust memory on the error
 * path. The slice caps bytes after reading; the timeout bounds the read time.
 */
async function readErrorBody(response: Response): Promise<string> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      response.text().then((text) => text.slice(0, MAX_ERROR_BODY_BYTES)),
      new Promise<string>((resolve) => {
        timer = setTimeout(
          () => resolve("[error body read timed out]"),
          ERROR_BODY_READ_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}
