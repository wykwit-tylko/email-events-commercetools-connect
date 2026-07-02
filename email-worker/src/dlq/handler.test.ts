import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env, QueuePayload } from "../env";
import { getStats } from "../stats/counters";
import { handleDlq } from "./handler";
import { FakeKV, FakeQueue, FakeStatsNamespace } from "../../test/fakes";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("handleDlq", () => {
  it("counts, backs up, and acknowledges a dead-lettered message", async () => {
    const env = createEnv();
    const message = createDlqMessage("dlq-1", { id: "notification-1", type: "OrderCreated" });

    await handleDlq(batch([message]), env);

    expect(message.acked).toBe(true);
    await expect(getStats(env)).resolves.toMatchObject({ dlq: 1 });
    const backup = await env.EMAIL_DEDUPE.get("dlq:dlq-1");
    expect(backup).not.toBeNull();
    expect(JSON.parse(backup as string).body).toMatchObject({ id: "notification-1" });
  });

  it("still acknowledges when the KV backup fails", async () => {
    const env = createEnv();
    env.EMAIL_DEDUPE.failPutKeys.add("dlq:dlq-2");
    const message = createDlqMessage("dlq-2", { id: "notification-2", type: "OrderCreated" });

    await handleDlq(batch([message]), env);

    expect(message.acked).toBe(true);
    await expect(getStats(env)).resolves.toMatchObject({ dlq: 1 });
    await expect(env.EMAIL_DEDUPE.get("dlq:dlq-2")).resolves.toBeNull();
  });

  it("posts to the alert webhook when ALERT_WEBHOOK_URL is set", async () => {
    const env = createEnv({ alertWebhookUrl: "https://alerts.example.com/hook" });
    const fetchSpy = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await handleDlq(batch([createDlqMessage("dlq-3", { id: "notification-3" })]), env);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://alerts.example.com/hook");
    expect(init).toMatchObject({ method: "POST" });
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({ queueMessageId: "dlq-3", notificationId: "notification-3" });
  });

  it("does not call fetch when no alert webhook is configured", async () => {
    const env = createEnv();
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await handleDlq(batch([createDlqMessage("dlq-4", {})]), env);

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

type TestEnv = Env & {
  EMAIL_DEDUPE: FakeKV;
  EMAIL_QUEUE: FakeQueue;
  STATS: FakeStatsNamespace;
};

function createEnv(options?: { alertWebhookUrl?: string }): TestEnv {
  return {
    EMAIL_DEDUPE: new FakeKV(),
    EMAIL: { async send() { return { messageId: "x" }; } },
    EMAIL_SENDING_ENABLED: "true",
    FROM_EMAIL: "orders@example.com",
    INTERNAL_NOTIFICATION_EMAILS: "ops@example.com",
    DEDUPE_TTL_SECONDS: "2592000",
    STORE_URL: "https://shelfmarket.tylko.dev",
    STATS: new FakeStatsNamespace(),
    EMAIL_QUEUE: new FakeQueue(),
    DLQ_QUEUE_NAME: "email-events-dlq",
    ALERT_WEBHOOK_URL: options?.alertWebhookUrl,
  } as unknown as TestEnv;
}

type TestMessage = Message<QueuePayload> & { acked: boolean };

function createDlqMessage(id: string, body: QueuePayload): TestMessage {
  return {
    id,
    timestamp: new Date(),
    body,
    attempts: 6,
    acked: false,
    ack(this: { acked: boolean }) {
      this.acked = true;
    },
  } as unknown as TestMessage;
}

function batch(messages: TestMessage[]): MessageBatch<QueuePayload> {
  return { queue: "email-events-dlq", messages } as unknown as MessageBatch<QueuePayload>;
}
