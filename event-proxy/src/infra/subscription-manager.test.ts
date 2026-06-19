import { describe, expect, it } from "vitest";
import type { Destination, Subscription, SubscriptionDraft } from "./commercetools-client.js";
import type { SubscriptionConfig } from "../config/env.js";
import { buildMessages, deleteSubscription, upsertSubscription } from "./subscription-manager.js";

const destination: Destination = {
  type: "GoogleCloudPubSub",
  projectId: "gcp-project",
  topic: "topic",
};

const config: SubscriptionConfig = {
  ctpApiUrl: "https://api.europe-west1.gcp.commercetools.com",
  ctpAuthUrl: "https://auth.europe-west1.gcp.commercetools.com",
  ctpProjectKey: "project",
  ctpClientId: "client-id",
  ctpClientSecret: "client-secret",
  ctpScope: "manage_subscriptions:project",
  subscriptionKey: "email-events-proxy",
  messageResourceTypes: ["order", "customer"],
  deliveryFormat: "Platform",
  connectSubscriptionDestination: "GoogleCloudPubSub",
  connectGcpProjectId: "gcp-project",
  connectGcpTopicName: "topic",
};

describe("subscription-manager", () => {
  it("builds resource-type-only Message subscriptions", () => {
    expect(buildMessages(["order", "customer"])).toEqual([
      { resourceTypeId: "order" },
      { resourceTypeId: "customer" },
    ]);
  });

  it("creates a missing Subscription", async () => {
    const client = new FakeCommercetoolsClient(undefined);

    const result = await upsertSubscription({ config, client: client as any });

    expect(result).toBe("created");
    expect(client.created?.messages).toEqual([
      { resourceTypeId: "order" },
      { resourceTypeId: "customer" },
    ]);
  });

  it("updates an existing Message-only Subscription", async () => {
    const client = new FakeCommercetoolsClient(createSubscription());

    const result = await upsertSubscription({ config, client: client as any });

    expect(result).toBe("updated");
    expect(client.updated?.version).toBe(1);
  });

  it("refuses to overwrite a Subscription with Change subscriptions", async () => {
    const client = new FakeCommercetoolsClient({
      ...createSubscription(),
      changes: [{ resourceTypeId: "order" }],
    });

    await expect(upsertSubscription({ config, client: client as any })).rejects.toThrow(
      "contains non-Message subscriptions",
    );
  });

  it("deletes an existing Subscription by key", async () => {
    const client = new FakeCommercetoolsClient(createSubscription());

    const result = await deleteSubscription({ config, client: client as any });

    expect(result).toBe("deleted");
    expect(client.deleted?.key).toBe(config.subscriptionKey);
  });
});

function createSubscription(): Subscription {
  return {
    id: "subscription-id",
    version: 1,
    key: config.subscriptionKey,
    destination,
    messages: [{ resourceTypeId: "order" }],
    changes: [],
    events: [],
    format: { type: "Platform" },
  };
}

class FakeCommercetoolsClient {
  created: SubscriptionDraft | undefined;
  updated:
    | {
        key: string;
        version: number;
        destination: Destination;
        messages: Array<{ resourceTypeId: string }>;
      }
    | undefined;
  deleted: { key: string; version: number } | undefined;

  constructor(private subscription: Subscription | undefined) {}

  async getSubscriptionByKey(): Promise<Subscription | undefined> {
    return this.subscription;
  }

  async createSubscription(draft: SubscriptionDraft): Promise<Subscription> {
    this.created = draft;
    this.subscription = createSubscription();
    return this.subscription;
  }

  async updateSubscription(options: {
    key: string;
    version: number;
    destination: Destination;
    messages: Array<{ resourceTypeId: string }>;
  }): Promise<Subscription> {
    this.updated = options;
    return createSubscription();
  }

  async deleteSubscription(options: { key: string; version: number }): Promise<void> {
    this.deleted = options;
    this.subscription = undefined;
  }
}
