import request from "supertest";
import { describe, expect, it } from "vitest";
import type { AppConfig } from "../config/env.js";
import { createApp } from "../server/app.js";
import { FakePublisher, createSilentLogger } from "../test/test-utils.js";
// Cross-package: the real worker queue handler consumes what the proxy publishes.
import { handleQueue } from "../../../email-worker/src/queue/handler.js";

/**
 * End-to-end across the proxy -> queue -> worker -> dedupe boundary.
 *
 * The proxy publishes a Commerce Notification as JSON; the email worker
 * consumes that same JSON from the Cloudflare Queue. These tests wire the real
 * proxy app to the real worker handler through an in-memory publisher, so a
 * drift in the published payload shape (envelope unwrapping, enrichment, field
 * names) surfaces as a worker-side failure here, not only in production.
 */

const baseConfig: AppConfig = {
  port: 8080,
  publisherConfigs: [
    { type: "cloudflare-queue", accountId: "a", queueId: "q", apiToken: "t" },
  ],
  messageTypes: [],
  maxBodyBytes: 1024 * 100,
  forwardingTimeoutMs: 500,
  dryRunForwarding: false,
  devInspectionEnabled: false,
  devInspectionMaxMessages: 100,
};

const ORDER_CREATED = {
  notificationType: "Message",
  projectKey: "demo",
  id: "message-id-1",
  version: 1,
  sequenceNumber: 1,
  resource: { typeId: "order", id: "order-id" },
  resourceVersion: 1,
  type: "OrderCreated",
  order: { id: "order-id", customerEmail: "shopper@example.com", orderNumber: "ORD-42" },
  createdAt: "2026-06-09T12:00:00.000Z",
  lastModifiedAt: "2026-06-09T12:00:00.000Z",
};

describe("proxy -> worker integration", () => {
  it("forwards an OrderCreated notification and the worker sends exactly one email", async () => {
    const publisher = new FakePublisher();
    const app = createApp({ config: baseConfig, publisher, logger: createSilentLogger() });
    const workerEnv = createWorkerEnv();

    await request(app)
      .post("/event-proxy")
      .set("Content-Type", "application/json")
      .send(JSON.stringify(ORDER_CREATED))
      .expect(200);

    expect(publisher.published).toHaveLength(1);
    await deliverToWorker(publisher.published[0]!.payload, workerEnv);

    expect(workerEnv.sentEmails).toHaveLength(1);
    expect(workerEnv.sentEmails[0]).toMatchObject({
      to: "shopper@example.com",
      from: "orders@example.com",
      subject: "Order ORD-42 confirmed",
    });
    await expect(workerEnv.kv.get("sent:message-id-1")).resolves.not.toBeNull();
  });

  it("unwraps a Google Pub/Sub envelope at the proxy and still reaches the worker", async () => {
    const publisher = new FakePublisher();
    const app = createApp(
      {
        config: { ...baseConfig, connectSubscriptionDestination: "GoogleCloudPubSub" },
        publisher,
        logger: createSilentLogger(),
      },
    );
    const workerEnv = createWorkerEnv();
    const envelope = {
      message: { data: Buffer.from(JSON.stringify(ORDER_CREATED)).toString("base64"), messageId: "m" },
      subscription: "subscription",
    };

    await request(app)
      .post("/event-proxy")
      .set("Content-Type", "application/json")
      .send(JSON.stringify(envelope))
      .expect(200);

    await deliverToWorker(publisher.published[0]!.payload, workerEnv);
    expect(workerEnv.sentEmails).toHaveLength(1);
    expect(workerEnv.sentEmails[0]?.subject).toBe("Order ORD-42 confirmed");
  });

  it("deduplicates when commercetools redelivers the same notification", async () => {
    const publisher = new FakePublisher();
    const app = createApp({ config: baseConfig, publisher, logger: createSilentLogger() });
    const workerEnv = createWorkerEnv();

    await request(app).post("/event-proxy").set("Content-Type", "application/json").send(JSON.stringify(ORDER_CREATED)).expect(200);
    await request(app).post("/event-proxy").set("Content-Type", "application/json").send(JSON.stringify(ORDER_CREATED)).expect(200);

    // Two publishes (the proxy does not dedupe), but the worker must send once.
    await deliverToWorker(publisher.published[0]!.payload, workerEnv);
    await deliverToWorker(publisher.published[1]!.payload, workerEnv);

    expect(workerEnv.sentEmails).toHaveLength(1);
  });

  it("drops a notification at the proxy when its type is not in CT_MESSAGE_TYPES", async () => {
    const publisher = new FakePublisher();
    const app = createApp(
      {
        config: { ...baseConfig, messageTypes: ["OrderCreated"] },
        publisher,
        logger: createSilentLogger(),
      },
    );

    await request(app)
      .post("/event-proxy")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ notificationType: "Message", id: "x", type: "CustomerCreated" }))
      .expect(200);

    expect(publisher.published).toHaveLength(0);
  });
});

type WorkerEnvFake = Record<string, unknown> & {
  kv: FakeKV;
  sentEmails: Array<{ to: string; from: string; subject: string; html: string; text: string }>;
};

async function deliverToWorker(payload: unknown, env: WorkerEnvFake): Promise<void> {
  const body = payload as Record<string, unknown>;
  const message = makeMessage(`q-${body.id ?? "id"}`, body);
  const batch = {
    queue: "commerce-notifications-email-dev",
    messages: [message],
    ackAll() {
      message.acked = true;
    },
    retryAll() {
      message.retried = true;
    },
  };
  await handleQueue(batch as never, env as never);
}

function makeMessage(id: string, body: Record<string, unknown>): {
  id: string;
  body: Record<string, unknown>;
  acked: boolean;
  retried: boolean;
  ack: () => void;
  retry: () => void;
} {
  const message = {
    id,
    timestamp: new Date(),
    body,
    attempts: 1,
    acked: false,
    retried: false,
  };
  return {
    ...message,
    ack: () => {
      message.acked = true;
    },
    retry: () => {
      message.retried = true;
    },
  };
}

function createWorkerEnv(): WorkerEnvFake {
  const sentEmails: WorkerEnvFake["sentEmails"] = [];
  const kv = new FakeKV();
  const stats = new FakeStatsNamespace();
  return {
    kv,
    sentEmails,
    EMAIL_DEDUPE: kv,
    EMAIL: {
      async send(message: WorkerEnvFake["sentEmails"][number]) {
        sentEmails.push(message);
        return { messageId: "email-id" };
      },
    },
    EMAIL_SENDING_ENABLED: "true",
    FROM_EMAIL: "orders@example.com",
    INTERNAL_NOTIFICATION_EMAILS: "ops@example.com",
    DEDUPE_TTL_SECONDS: "2592000",
    STORE_URL: "https://shelfmarket.tylko.dev",
    DLQ_QUEUE_NAME: "email-events-dlq",
    STATS: stats,
    EMAIL_QUEUE: {
      async send() {
        return { metadata: { metrics: {} } };
      },
    },
  } as unknown as WorkerEnvFake;
}

class FakeKV {
  private readonly values = new Map<string, string>();
  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }
  async put(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }
}

class FakeStatsNamespace {
  private stats = { processed: 0, ignored: 0, duplicate: 0, disabled: 0, emailsSent: 0, errors: 0, dlq: 0 };
  idFromName(): string {
    return "stats-id";
  }
  get() {
    const stats = this.stats;
    return {
      async increment(field: keyof typeof stats) {
        stats[field] += 1;
      },
      async read() {
        return { ...stats };
      },
    };
  }
}
