import { describe, expect, it } from "vitest";
import type { Env, QueuePayload } from "./env";
import worker from "./index";
import { storeDlqMessage } from "./dlq/dlq-store";
import { getStats } from "./stats/counters";
import { FakeKV, FakeQueue, FakeStatsNamespace } from "../test/fakes";

describe("worker fetch", () => {
  it("returns counters from /stats", async () => {
    const env = createEnv();
    const response = await worker.fetch?.(new Request("https://x/stats"), env);
    expect(response?.status).toBe(200);
    const body = (await response?.json()) as Record<string, number>;
    expect(body).toMatchObject({
      processed: 0,
      emailsSent: 0,
      errors: 0,
      dlq: 0,
    });
  });

  it("hides admin endpoints when ADMIN_TOKEN is not set", async () => {
    const env = createEnv();
    const response = await worker.fetch?.(
      new Request("https://x/admin/replay-dlq", { method: "POST" }),
      env,
    );
    expect(response?.status).toBe(404);
  });

  it("rejects admin requests with the wrong token", async () => {
    const env = createEnv({ adminToken: "secret" });
    const response = await worker.fetch?.(
      new Request("https://x/admin/dlq", {
        headers: { authorization: "Bearer wrong" },
      }),
      env,
    );
    expect(response?.status).toBe(401);
  });

  it("replays the dead-letter backlog on an authorized POST", async () => {
    const env = createEnv({ adminToken: "secret" });
    await storeDlqMessage(env, message("q-1", { id: "n-1", type: "OrderCreated" }));

    const response = await worker.fetch?.(
      new Request("https://x/admin/replay-dlq", {
        method: "POST",
        headers: { authorization: "Bearer secret" },
      }),
      env,
    );

    expect(response?.status).toBe(200);
    expect(await response?.json()).toEqual({ replayed: 1, failed: 0, remaining: false });
    expect(env.EMAIL_QUEUE.sent).toHaveLength(1);
  });

  it("lists the dead-letter backlog on an authorized GET", async () => {
    const env = createEnv({ adminToken: "secret" });
    await storeDlqMessage(env, message("q-1", { id: "n-1" }));

    const response = await worker.fetch?.(
      new Request("https://x/admin/dlq", {
        headers: { authorization: "Bearer secret" },
      }),
      env,
    );

    expect(response?.status).toBe(200);
    const body = (await response?.json()) as { count: number };
    expect(body.count).toBe(1);
  });
});

describe("worker queue routing", () => {
  it("routes dead-letter-queue batches to the DLQ handler", async () => {
    const env = createEnv();
    const dlqMessage = ackable("q-1", { id: "n-1", type: "OrderCreated" });
    await worker.queue?.(dlqBatch(env, [dlqMessage]), env);

    expect(dlqMessage.acked).toBe(true);
    await expect(getStats(env)).resolves.toMatchObject({ dlq: 1 });
  });

  it("routes main-queue batches to the email handler", async () => {
    const env = createEnv({ emailSendingEnabled: true });
    const order = ackable("q-2", {
      notificationType: "Message",
      id: "n-2",
      type: "OrderCreated",
      order: { id: "order-1", customerEmail: "customer@example.com", orderNumber: "ORD-1" },
    });

    await worker.queue?.(mainBatch([order]), env);

    expect(order.acked).toBe(true);
    expect(env.sentEmails).toHaveLength(1);
  });
});

type TestEnv = Env & {
  EMAIL_DEDUPE: FakeKV;
  EMAIL_QUEUE: FakeQueue;
  STATS: FakeStatsNamespace;
  sentEmails: SentEmail[];
};

interface SentEmail {
  to: string;
  from: string;
  subject: string;
  html: string;
  text: string;
}

function createEnv(options?: { adminToken?: string; emailSendingEnabled?: boolean }): TestEnv {
  const sentEmails: SentEmail[] = [];
  return {
    EMAIL_DEDUPE: new FakeKV(),
    EMAIL: {
      async send(message: SentEmail) {
        sentEmails.push(message);
        return { messageId: "email-id" };
      },
    },
    EMAIL_SENDING_ENABLED: String(options?.emailSendingEnabled ?? false),
    FROM_EMAIL: "orders@example.com",
    INTERNAL_NOTIFICATION_EMAILS: "ops@example.com",
    DEDUPE_TTL_SECONDS: "2592000",
    STORE_URL: "https://shelfmarket.tylko.dev",
    STATS: new FakeStatsNamespace(),
    EMAIL_QUEUE: new FakeQueue(),
    DLQ_QUEUE_NAME: "email-events-dlq",
    ADMIN_TOKEN: options?.adminToken,
    sentEmails,
  } as unknown as TestEnv;
}

function message(id: string, body: QueuePayload): Message<QueuePayload> {
  return { id, timestamp: new Date(), body, attempts: 6 } as Message<QueuePayload>;
}

type Ackable = Message<QueuePayload> & { acked: boolean };
function ackable(id: string, body: QueuePayload): Ackable {
  return {
    id,
    timestamp: new Date(),
    body,
    attempts: 1,
    acked: false,
    ack(this: { acked: boolean }) {
      this.acked = true;
    },
  } as unknown as Ackable;
}

function dlqBatch(env: TestEnv, messages: Ackable[]): MessageBatch<QueuePayload> {
  return { queue: env.DLQ_QUEUE_NAME, messages } as unknown as MessageBatch<QueuePayload>;
}

function mainBatch(messages: Ackable[]): MessageBatch<QueuePayload> {
  return { queue: "commerce-notifications-email-dev", messages } as unknown as MessageBatch<QueuePayload>;
}
