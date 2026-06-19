import { afterEach, describe, expect, it, vi } from "vitest";
import {
  signWebhook,
  WEBHOOK_ID_HEADER,
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_TIMESTAMP_HEADER,
} from "../shared/webhook-signing";
import { HttpWebhookPublisher } from "./http-webhook-publisher";

describe("HttpWebhookPublisher", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("POSTs a signed Email Event with replay headers", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("", { status: 200 }));
    const publisher = new HttpWebhookPublisher({
      endpointUrl: "https://store.example.com/api/webhooks/events",
      emailEventSecret: "email-event-secret",
      timeoutMs: 1000,
    });

    const payload = { id: "msg-1", type: "OrderCreated" };
    await publisher.publish(payload);

    const call = fetchMock.mock.calls[0];
    if (!call) {
      throw new Error("fetch was not called");
    }
    const [url, init] = call;
    if (!init) {
      throw new Error("fetch init missing");
    }
    expect(url).toBe("https://store.example.com/api/webhooks/events");
    expect(init.method).toBe("POST");

    const headers = init.headers as Record<string, string>;
    expect(headers[WEBHOOK_ID_HEADER]).toBe("msg-1");
    expect(headers[WEBHOOK_TIMESTAMP_HEADER]).toMatch(/^\d{10}$/);

    const body = init.body as string;
    expect(body).toBe(JSON.stringify(payload));

    // The signature must cover the exact bytes sent and verify against the
    // shared secret, independent of the current time.
    const expectedSignature = await signWebhook("email-event-secret", {
      timestamp: headers[WEBHOOK_TIMESTAMP_HEADER],
      messageId: "msg-1",
      body,
    });
    expect(headers[WEBHOOK_SIGNATURE_HEADER]).toBe(expectedSignature);
  });

  it("throws on a non-2xx response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("bad signature", { status: 401 }));
    const publisher = new HttpWebhookPublisher({
      endpointUrl: "https://store.example.com/api/webhooks/events",
      emailEventSecret: "email-event-secret",
      timeoutMs: 1000,
    });

    await expect(publisher.publish({ id: "msg-1" })).rejects.toThrow(
      "HTTP webhook publish to https://store.example.com/api/webhooks/events failed with 401",
    );
  });

  it("falls back to a content digest when the payload has no id", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 200 }));
    const publisher = new HttpWebhookPublisher({
      endpointUrl: "https://store.example.com/api/webhooks/events",
      emailEventSecret: "email-event-secret",
      timeoutMs: 1000,
    });

    const payload = { type: "OrderCreated" };
    await publisher.publish(payload);

    const fetchMock = vi.mocked(globalThis.fetch);
    const call = fetchMock.mock.calls[0];
    if (!call) {
      throw new Error("fetch was not called");
    }
    const [, init] = call;
    if (!init) {
      throw new Error("fetch init missing");
    }
    const headers = init.headers as Record<string, string>;
    const body = init.body as string;

    // No payload id -> fallback is the sha256 hex of the body.
    expect(headers[WEBHOOK_ID_HEADER]).toMatch(/^[0-9a-f]{64}$/);

    // The signature still validates against the fallback id.
    const expectedSignature = await signWebhook("email-event-secret", {
      timestamp: headers[WEBHOOK_TIMESTAMP_HEADER],
      messageId: headers[WEBHOOK_ID_HEADER],
      body,
    });
    expect(headers[WEBHOOK_SIGNATURE_HEADER]).toBe(expectedSignature);
  });
});
