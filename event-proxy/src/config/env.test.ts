import { describe, expect, it } from "vitest";
import { loadAppConfig, loadSubscriptionConfig } from "./env.js";

const publisherConfig = JSON.stringify({
  type: "cloudflare-queue",
  accountId: "account-id",
  queueId: "queue-id",
  apiToken: "token",
});

describe("config", () => {
  it("requires outbound publisher config for app config", () => {
    expect(() => loadAppConfig({})).toThrow("OUTBOUND_PUBLISHER_CONFIG is required");
  });

  it("loads app defaults", () => {
    const config = loadAppConfig({
      OUTBOUND_PUBLISHER_CONFIG: publisherConfig,
    });

    expect(config.port).toBe(8080);
    expect(config.publisherConfigs).toEqual([
      {
        type: "cloudflare-queue",
        accountId: "account-id",
        queueId: "queue-id",
        apiToken: "token",
      },
    ]);
    expect(config.messageTypes).toEqual([]);
    expect(config.maxBodyBytes).toBe(90_000);
    expect(config.forwardingTimeoutMs).toBe(2_000);
    expect(config.dryRunForwarding).toBe(false);
    expect(config.devInspectionEnabled).toBe(false);
    expect(config.devInspectionMaxMessages).toBe(100);
    expect(config.devInspectionToken).toBeUndefined();
  });

  it("treats an empty dev inspection token as unset", () => {
    const config = loadAppConfig({
      OUTBOUND_PUBLISHER_CONFIG: publisherConfig,
      DEV_INSPECTION_TOKEN: "",
    });

    expect(config.devInspectionToken).toBeUndefined();
  });

  it("loads the dev inspection token when set", () => {
    const config = loadAppConfig({
      OUTBOUND_PUBLISHER_CONFIG: publisherConfig,
      DEV_INSPECTION_TOKEN: "inspect-secret",
    });

    expect(config.devInspectionToken).toBe("inspect-secret");
  });

  it("loads message type filters with de-duplication", () => {
    const config = loadAppConfig({
      OUTBOUND_PUBLISHER_CONFIG: publisherConfig,
      CT_MESSAGE_TYPES: "OrderCreated, CustomerCreated, OrderCreated",
    });

    expect(config.messageTypes).toEqual(["OrderCreated", "CustomerCreated"]);
  });

  it("rejects unsupported publisher config types", () => {
    expect(() =>
      loadAppConfig({
        OUTBOUND_PUBLISHER_CONFIG: JSON.stringify({ type: "sns" }),
      }),
    ).toThrow("OUTBOUND_PUBLISHER_CONFIG[0].type must be cloudflare-queue or http-webhook");
  });

  it("parses an http-webhook publisher config", () => {
    const config = loadAppConfig({
      OUTBOUND_PUBLISHER_CONFIG: JSON.stringify({
        type: "http-webhook",
        endpointUrl: "https://store.example.com/api/webhooks/events",
        emailEventSecret: "secret",
      }),
    });

    expect(config.publisherConfigs).toEqual([
      {
        type: "http-webhook",
        endpointUrl: "https://store.example.com/api/webhooks/events",
        emailEventSecret: "secret",
      },
    ]);
  });

  it("requires endpointUrl and emailEventSecret for http-webhook configs", () => {
    expect(() =>
      loadAppConfig({
        OUTBOUND_PUBLISHER_CONFIG: JSON.stringify({ type: "http-webhook" }),
      }),
    ).toThrow("OUTBOUND_PUBLISHER_CONFIG[0].endpointUrl is required");
  });

  it("accepts a fan-out array of publisher configs", () => {
    const config = loadAppConfig({
      OUTBOUND_PUBLISHER_CONFIG: JSON.stringify([
        {
          type: "cloudflare-queue",
          accountId: "account-id",
          queueId: "queue-id",
          apiToken: "token",
        },
        {
          type: "http-webhook",
          endpointUrl: "https://store.example.com/api/webhooks/events",
          emailEventSecret: "secret",
        },
      ]),
    });

    expect(config.publisherConfigs).toHaveLength(2);
    expect(config.publisherConfigs[0]?.type).toBe("cloudflare-queue");
    expect(config.publisherConfigs[1]?.type).toBe("http-webhook");
  });

  it("rejects an empty publisher config array", () => {
    expect(() =>
      loadAppConfig({
        OUTBOUND_PUBLISHER_CONFIG: "[]",
      }),
    ).toThrow("OUTBOUND_PUBLISHER_CONFIG array must contain at least one publisher");
  });

  it("loads subscription config with resource type de-duplication", () => {
    const config = loadSubscriptionConfig({
      CTP_REGION: "europe-west1.gcp",
      CTP_PROJECT_KEY: "project",
      CTP_CLIENT_ID: "client-id",
      CTP_CLIENT_SECRET: "client-secret",
      CTP_SCOPE: "manage_subscriptions:project",
      CT_MESSAGE_RESOURCE_TYPES: "order, customer, order",
    });

    expect(config.messageResourceTypes).toEqual(["order", "customer"]);
    expect(config.deliveryFormat).toBe("Platform");
  });
});
