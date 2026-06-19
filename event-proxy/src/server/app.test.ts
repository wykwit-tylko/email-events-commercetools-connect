import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import type { AppConfig } from "../config/env.js";
import { InspectionStore } from "../dev-inspection/inspection-store.js";
import { createSilentLogger, FakePublisher } from "../test/test-utils.js";

const baseConfig: AppConfig = {
  port: 8080,
  publisherConfigs: [
    {
      type: "cloudflare-queue",
      accountId: "account-id",
      queueId: "queue-id",
      apiToken: "token",
    },
  ],
  messageTypes: [],
  maxBodyBytes: 1024,
  forwardingTimeoutMs: 50,
  dryRunForwarding: false,
  devInspectionEnabled: false,
  devInspectionMaxMessages: 100,
};

describe("event proxy app", () => {
  it("publishes parsed Commerce Notification JSON to the outbound publisher", async () => {
    const publisher = new FakePublisher();
    const app = createApp({
      config: baseConfig,
      publisher,
      logger: createSilentLogger(),
    });
    const bodyText = '{"type":"OrderCreated","spacing": true}';

    await request(app)
      .post("/event-proxy")
      .set("Content-Type", "application/json")
      .send(bodyText)
      .expect(200);

    expect(publisher.published).toHaveLength(1);
    expect(publisher.published[0]?.payload).toEqual({
      type: "OrderCreated",
      spacing: true,
    });
    expect(publisher.published[0]?.options?.contentType).toContain("application/json");
  });

  it("unwraps a Connect Google Pub/Sub transport envelope without parsing the Commerce Notification", async () => {
    const publisher = new FakePublisher();
    const app = createApp({
      config: {
        ...baseConfig,
        connectSubscriptionDestination: "GoogleCloudPubSub",
      },
      publisher,
      logger: createSilentLogger(),
    });
    const commerceNotification = Buffer.from(
      '{"notificationType":"Message","type":"OrderCreated"}',
    );
    const envelope = {
      message: {
        data: commerceNotification.toString("base64"),
        messageId: "message-id",
      },
      subscription: "subscription",
    };

    await request(app)
      .post("/event-proxy")
      .set("Content-Type", "application/json")
      .send(JSON.stringify(envelope))
      .expect(200);

    expect(publisher.published).toHaveLength(1);
    expect(publisher.published[0]?.payload).toEqual({
      notificationType: "Message",
      type: "OrderCreated",
    });
  });

  it("publishes Commerce Notifications matching the message type filter", async () => {
    const publisher = new FakePublisher();
    const app = createApp({
      config: { ...baseConfig, messageTypes: ["OrderCreated"] },
      publisher,
      logger: createSilentLogger(),
    });

    await request(app)
      .post("/event-proxy")
      .set("Content-Type", "application/json")
      .send('{"notificationType":"Message","type":"OrderCreated"}')
      .expect(200);

    expect(publisher.published).toHaveLength(1);
    expect(publisher.published[0]?.payload).toEqual({
      notificationType: "Message",
      type: "OrderCreated",
    });
  });

  it("skips Commerce Notifications outside the message type filter", async () => {
    const publisher = new FakePublisher();
    const logger = createSilentLogger();
    const app = createApp({
      config: { ...baseConfig, messageTypes: ["OrderCreated"] },
      publisher,
      logger,
    });

    await request(app)
      .post("/event-proxy")
      .set("Content-Type", "application/json")
      .send('{"notificationType":"Message","type":"CustomerCreated"}')
      .expect(200);

    expect(publisher.published).toHaveLength(0);
    expect(logger.entries).toContainEqual({
      level: "info",
      message: "commerce notification skipped by message type filter",
      fields: expect.objectContaining({
        messageType: "CustomerCreated",
        allowedMessageTypes: ["OrderCreated"],
      }),
    });
  });

  it("does not require a ready publisher when message type filtering skips the Commerce Notification", async () => {
    const publisher = new FakePublisher();
    publisher.ready = false;
    const app = createApp({
      config: { ...baseConfig, messageTypes: ["OrderCreated"] },
      publisher,
      logger: createSilentLogger(),
    });

    await request(app)
      .post("/event-proxy")
      .set("Content-Type", "application/json")
      .send('{"notificationType":"Message","type":"CustomerCreated"}')
      .expect(200);

    expect(publisher.published).toHaveLength(0);
  });

  it("returns 413 when the request body exceeds the configured limit", async () => {
    const publisher = new FakePublisher();
    const app = createApp({
      config: { ...baseConfig, maxBodyBytes: 4 },
      publisher,
      logger: createSilentLogger(),
    });

    await request(app).post("/event-proxy").send("12345").expect(413);

    expect(publisher.published).toHaveLength(0);
  });

  it("returns 503 when the publisher is not ready", async () => {
    const publisher = new FakePublisher();
    publisher.ready = false;
    const app = createApp({
      config: baseConfig,
      publisher,
      logger: createSilentLogger(),
    });

    await request(app)
      .post("/event-proxy")
      .set("Content-Type", "application/json")
      .send('{"type":"OrderCreated"}')
      .expect(503);

    expect(publisher.published).toHaveLength(0);
  });

  it("returns 503 when forwarding fails", async () => {
    const publisher = new FakePublisher();
    publisher.error = new Error("publish failed");
    const app = createApp({
      config: baseConfig,
      publisher,
      logger: createSilentLogger(),
    });

    await request(app)
      .post("/event-proxy")
      .set("Content-Type", "application/json")
      .send('{"type":"OrderCreated"}')
      .expect(503);
  });

  it("returns 503 when forwarding times out", async () => {
    const publisher = new FakePublisher();
    publisher.neverResolve = true;
    const app = createApp({
      config: { ...baseConfig, forwardingTimeoutMs: 1 },
      publisher,
      logger: createSilentLogger(),
    });

    await request(app)
      .post("/event-proxy")
      .set("Content-Type", "application/json")
      .send('{"type":"OrderCreated"}')
      .expect(503);
  });

  it("stores messages in the dev inspection log when enabled", async () => {
    const publisher = new FakePublisher();
    const inspectionStore = new InspectionStore(2);
    const app = createApp({
      config: {
        ...baseConfig,
        devInspectionEnabled: true,
        devInspectionToken: "inspect-secret",
        dryRunForwarding: true,
      },
      publisher,
      logger: createSilentLogger(),
      inspectionStore,
    });

    await request(app)
      .post("/event-proxy")
      .set("Content-Type", "application/json")
      .send('{"type":"OrderCreated"}')
      .expect(200);

    expect(publisher.published).toHaveLength(0);

    const listResponse = await request(app)
      .get("/event-proxy/dev/messages")
      .set("Authorization", "Bearer inspect-secret")
      .expect(200);

    expect(listResponse.body.results).toHaveLength(1);
    expect(listResponse.body.results[0].body).toEqual({
      type: "OrderCreated",
    });
  });

  it("rejects dev inspection requests without the expected bearer token", async () => {
    const inspectionStore = new InspectionStore(2);
    const app = createApp({
      config: {
        ...baseConfig,
        devInspectionEnabled: true,
        devInspectionToken: "inspect-secret",
      },
      publisher: new FakePublisher(),
      logger: createSilentLogger(),
      inspectionStore,
    });

    await request(app).get("/event-proxy/dev/messages").expect(401);
    await request(app)
      .get("/event-proxy/dev/messages")
      .set("Authorization", "Bearer wrong-token")
      .expect(401);
    await request(app).get("/event-proxy/dev/messages/1").expect(401);
    await request(app).delete("/event-proxy/dev/messages").expect(401);
  });

  it("responds 404 on dev inspection endpoints when no token is configured", async () => {
    const logger = createSilentLogger();
    const app = createApp({
      config: {
        ...baseConfig,
        devInspectionEnabled: true,
      },
      publisher: new FakePublisher(),
      logger,
      inspectionStore: new InspectionStore(2),
    });

    await request(app).get("/event-proxy/dev/messages").expect(404);
    await request(app)
      .get("/event-proxy/dev/messages")
      .set("Authorization", "Bearer anything")
      .expect(404);
  });

  it("redacts token values and masks emails in stored inspection entries", async () => {
    const publisher = new FakePublisher();
    const inspectionStore = new InspectionStore(2);
    const app = createApp({
      config: {
        ...baseConfig,
        devInspectionEnabled: true,
        devInspectionToken: "inspect-secret",
        dryRunForwarding: true,
      },
      publisher,
      logger: createSilentLogger(),
      inspectionStore,
    });

    await request(app)
      .post("/event-proxy")
      .set("Content-Type", "application/json")
      .send(
        '{"notificationType":"Message","type":"CustomerEmailTokenCreated","customerId":"cust-1","customerEmail":"user@example.com","expiresAt":"2026-06-10T12:00:00.000Z","value":"token-123"}',
      )
      .expect(200);

    const listResponse = await request(app)
      .get("/event-proxy/dev/messages")
      .set("Authorization", "Bearer inspect-secret")
      .expect(200);

    expect(listResponse.body.results).toHaveLength(1);
    expect(listResponse.body.results[0].body).toMatchObject({
      type: "CustomerEmailTokenCreated",
      value: "[redacted]",
      customerEmail: "u***@example.com",
    });
  });

  it("returns 400 for invalid Commerce Notification JSON", async () => {
    const publisher = new FakePublisher();
    const app = createApp({
      config: baseConfig,
      publisher,
      logger: createSilentLogger(),
    });

    await request(app).post("/event-proxy").send("not-json").expect(400);

    expect(publisher.published).toHaveLength(0);
  });

  it("does not expose dev inspection endpoints when disabled", async () => {
    const publisher = new FakePublisher();
    const app = createApp({
      config: baseConfig,
      publisher,
      logger: createSilentLogger(),
    });

    await request(app).get("/event-proxy/dev/messages").expect(404);
  });

  it("skips token messages when value is absent", async () => {
    const publisher = new FakePublisher();
    const app = createApp({
      config: baseConfig,
      publisher,
      logger: createSilentLogger(),
    });

    await request(app)
      .post("/event-proxy")
      .set("Content-Type", "application/json")
      .send(
        '{"notificationType":"Message","type":"CustomerEmailTokenCreated","customerId":"cust-1","expiresAt":"2026-06-10T12:00:00.000Z"}',
      )
      .expect(200);

    expect(publisher.published).toHaveLength(0);
  });

  it("returns 503 for token messages needing enrichment when no commercetools client is configured", async () => {
    const publisher = new FakePublisher();
    const logger = createSilentLogger();
    const app = createApp({
      config: baseConfig,
      publisher,
      logger,
    });

    await request(app)
      .post("/event-proxy")
      .set("Content-Type", "application/json")
      .send(
        '{"notificationType":"Message","type":"CustomerEmailTokenCreated","customerId":"cust-1","expiresAt":"2026-06-10T12:00:00.000Z","value":"token-123"}',
      )
      .expect(503);

    expect(publisher.published).toHaveLength(0);
    expect(logger.entries).toContainEqual({
      level: "warn",
      message: "commerce notification enrichment unavailable, requesting retry",
      fields: expect.objectContaining({
        messageType: "CustomerEmailTokenCreated",
        reason: "no commercetools client available",
      }),
    });
  });

  it("returns 200 and warns when the customer is not found", async () => {
    const publisher = new FakePublisher();
    const logger = createSilentLogger();
    const app = createApp({
      config: baseConfig,
      publisher,
      logger,
      commercetoolsClient: {
        async getCustomerById() {
          return undefined;
        },
      } as any,
    });

    await request(app)
      .post("/event-proxy")
      .set("Content-Type", "application/json")
      .send(
        '{"notificationType":"Message","type":"CustomerEmailTokenCreated","customerId":"cust-1","expiresAt":"2026-06-10T12:00:00.000Z","value":"token-123"}',
      )
      .expect(200);

    expect(publisher.published).toHaveLength(0);
    expect(logger.entries).toContainEqual({
      level: "warn",
      message: "commerce notification skipped: enrichment failed",
      fields: expect.objectContaining({
        messageType: "CustomerEmailTokenCreated",
        reason: "customer cust-1 not found",
      }),
    });
  });

  it("forwards token messages with both value and customerEmail", async () => {
    const publisher = new FakePublisher();
    const app = createApp({
      config: baseConfig,
      publisher,
      logger: createSilentLogger(),
    });

    await request(app)
      .post("/event-proxy")
      .set("Content-Type", "application/json")
      .send(
        '{"notificationType":"Message","type":"CustomerEmailTokenCreated","customerId":"cust-1","customerEmail":"user@example.com","expiresAt":"2026-06-10T12:00:00.000Z","value":"token-123"}',
      )
      .expect(200);

    expect(publisher.published).toHaveLength(1);
    expect(publisher.published[0]?.payload).toMatchObject({
      type: "CustomerEmailTokenCreated",
      customerEmail: "user@example.com",
      value: "token-123",
    });
  });
});
