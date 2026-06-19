import {
  buildDestination,
  buildFormat,
  type CommercetoolsClient,
  type Destination,
  type MessageSubscription,
  type Subscription,
} from "./commercetools-client.js";
import type { SubscriptionConfig } from "../config/env.js";

export async function upsertSubscription(options: {
  config: SubscriptionConfig;
  client: CommercetoolsClient;
}): Promise<"created" | "updated" | "recreated"> {
  const destination = buildDestination(options.config);
  const messages = buildMessages(options.config.messageResourceTypes);
  const format = buildFormat(options.config.deliveryFormat);
  const existing = await options.client.getSubscriptionByKey(options.config.subscriptionKey);

  if (!existing) {
    await options.client.createSubscription({
      key: options.config.subscriptionKey,
      destination,
      messages,
      format,
    });
    return "created";
  }

  assertExpectedShape(existing);

  if (!sameFormat(existing.format, format)) {
    await options.client.deleteSubscription({
      key: options.config.subscriptionKey,
      version: existing.version,
    });
    await options.client.createSubscription({
      key: options.config.subscriptionKey,
      destination,
      messages,
      format,
    });
    return "recreated";
  }

  await options.client.updateSubscription({
    key: options.config.subscriptionKey,
    version: existing.version,
    destination,
    messages,
  });
  return "updated";
}

export async function deleteSubscription(options: {
  config: SubscriptionConfig;
  client: CommercetoolsClient;
}): Promise<"deleted" | "missing"> {
  const existing = await options.client.getSubscriptionByKey(options.config.subscriptionKey);

  if (!existing) {
    return "missing";
  }

  await options.client.deleteSubscription({
    key: options.config.subscriptionKey,
    version: existing.version,
  });
  return "deleted";
}

export function buildMessages(resourceTypes: string[]): MessageSubscription[] {
  return resourceTypes.map((resourceTypeId) => ({ resourceTypeId }));
}

function assertExpectedShape(subscription: Subscription): void {
  if (subscription.changes.length > 0 || subscription.events.length > 0) {
    throw new Error(
      `Subscription ${subscription.key || subscription.id} contains non-Message subscriptions; refusing to overwrite it`,
    );
  }

  const hasMessageTypeFilters = subscription.messages.some(
    (message: MessageSubscription & { types?: string[] }) =>
      Array.isArray(message.types) && message.types.length > 0,
  );

  if (hasMessageTypeFilters) {
    throw new Error(
      `Subscription ${subscription.key || subscription.id} contains message type filters; refusing to overwrite it`,
    );
  }
}

function sameFormat(
  actual: Subscription["format"] | undefined,
  expected: ReturnType<typeof buildFormat>,
): boolean {
  const actualType = actual?.type || "Platform";
  return (
    actualType === expected.type &&
    (actual?.cloudEventsVersion || undefined) === (expected.cloudEventsVersion || undefined)
  );
}

export function sameDestination(actual: Destination, expected: Destination): boolean {
  return JSON.stringify(actual) === JSON.stringify(expected);
}
