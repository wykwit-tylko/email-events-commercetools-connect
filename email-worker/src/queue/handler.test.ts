import { describe, expect, it } from "vitest";
import type { Env, QueuePayload } from "../env";
import { getStats } from "../stats/counters";
import { FakeKV, FakeQueue, FakeStatsNamespace } from "../../test/fakes";
import { handleQueue } from "./handler";

describe("handleQueue", () => {
  it("ignores unsupported notification types", async () => {
    const env = createTestEnv({ emailSendingEnabled: true });
    const message = createMessage({
      notificationType: "Message",
      type: "CustomerCreated",
    });

    await handleQueue(createBatch([message]), env);

    expect(message.acked).toBe(true);
    expect(env.sentEmails).toHaveLength(0);
    await expect(getStats(env)).resolves.toMatchObject({
      processed: 1,
      ignored: 1,
    });
  });

  it("sends email for OrderCreated notifications", async () => {
    const env = createTestEnv({ emailSendingEnabled: true });
    const message = createMessage({
      notificationType: "Message",
      id: "message-id",
      type: "OrderCreated",
      order: {
        id: "order-id",
        customerEmail: "customer@example.com",
        orderNumber: "ORD-1",
      },
    });

    await handleQueue(createBatch([message]), env);

    expect(message.acked).toBe(true);
    expect(env.sentEmails).toEqual([
      expect.objectContaining({
        to: "customer@example.com",
        from: "orders@example.com",
        subject: "Order ORD-1 confirmed",
      }),
    ]);
    await expect(env.EMAIL_DEDUPE.get("sent:message-id")).resolves.not.toBeNull();
    await expect(getStats(env)).resolves.toMatchObject({
      processed: 1,
      emailsSent: 1,
    });
  });

  it("skips duplicate OrderCreated notifications", async () => {
    const env = createTestEnv({ emailSendingEnabled: true });
    await env.EMAIL_DEDUPE.put("sent:message-id", "already-sent");
    const message = createOrderCreatedMessage();

    await handleQueue(createBatch([message]), env);

    expect(message.acked).toBe(true);
    expect(env.sentEmails).toHaveLength(0);
    await expect(getStats(env)).resolves.toMatchObject({
      processed: 1,
      duplicate: 1,
    });
  });

  it("skips email sending when disabled", async () => {
    const env = createTestEnv({ emailSendingEnabled: false });
    const message = createOrderCreatedMessage();

    await handleQueue(createBatch([message]), env);

    expect(message.acked).toBe(true);
    expect(env.sentEmails).toHaveLength(0);
    await expect(env.EMAIL_DEDUPE.get("sent:message-id")).resolves.toBeNull();
    await expect(getStats(env)).resolves.toMatchObject({
      processed: 1,
      disabled: 1,
    });
  });

  it("retries the message when sending fails", async () => {
    const env = createTestEnv({
      emailSendingEnabled: true,
      sendError: new Error("send failed"),
    });
    const message = createOrderCreatedMessage();

    await handleQueue(createBatch([message]), env);

    expect(message.acked).toBe(false);
    expect(message.retried).toBe(true);
    await expect(env.EMAIL_DEDUPE.get("sent:message-id")).resolves.toBeNull();
    await expect(getStats(env)).resolves.toMatchObject({
      processed: 1,
      errors: 1,
    });
  });

  it("acknowledges the message when recording dedupe fails after a successful send", async () => {
    const env = createTestEnv({ emailSendingEnabled: true });
    env.EMAIL_DEDUPE.failPutKeys.add("sent:message-id");
    const message = createOrderCreatedMessage();

    await handleQueue(createBatch([message]), env);

    expect(env.sentEmails).toHaveLength(1);
    expect(message.acked).toBe(true);
    expect(message.retried).toBe(false);
  });

  it("retries a message that fails unexpectedly without failing the rest of the batch", async () => {
    const env = createTestEnv({ emailSendingEnabled: true });
    env.EMAIL_DEDUPE.failGetKeys.add("sent:failing-id");
    const failing = createMessage({
      notificationType: "Message",
      id: "failing-id",
      type: "OrderCreated",
      order: {
        id: "order-id",
        customerEmail: "customer@example.com",
        orderNumber: "ORD-2",
      },
    });
    const ok = createOrderCreatedMessage();

    await handleQueue(createBatch([failing, ok]), env);

    expect(failing.retried).toBe(true);
    expect(failing.acked).toBe(false);
    expect(ok.acked).toBe(true);
    expect(env.sentEmails).toHaveLength(1);
  });

  it("sends email for CustomerEmailTokenCreated notifications", async () => {
    const env = createTestEnv({ emailSendingEnabled: true });
    const message = createMessage({
      notificationType: "Message",
      id: "email-token-id",
      type: "CustomerEmailTokenCreated",
      customerId: "customer-id",
      customerEmail: "newuser@example.com",
      expiresAt: "2026-06-10T12:00:00.000Z",
      value: "verify-token-123",
    });

    await handleQueue(createBatch([message]), env);

    expect(message.acked).toBe(true);
    expect(env.sentEmails).toHaveLength(1);
    expect(env.sentEmails[0]?.to).toBe("newuser@example.com");
    expect(env.sentEmails[0]?.subject).toBe("Your ShelfMarket confirmation code");
    expect(env.sentEmails[0]?.html).toContain("verify-token-123");
    await expect(env.EMAIL_DEDUPE.get("sent:email-token-id")).resolves.not.toBeNull();
    await expect(getStats(env)).resolves.toMatchObject({
      processed: 1,
      emailsSent: 1,
    });
  });

  it("sends email for CustomerPasswordTokenCreated notifications", async () => {
    const env = createTestEnv({ emailSendingEnabled: true });
    const message = createMessage({
      notificationType: "Message",
      id: "password-token-id",
      type: "CustomerPasswordTokenCreated",
      customerId: "customer-id",
      customerEmail: "user@example.com",
      expiresAt: "2026-06-10T12:00:00.000Z",
      value: "reset-token-456",
    });

    await handleQueue(createBatch([message]), env);

    expect(message.acked).toBe(true);
    expect(env.sentEmails).toHaveLength(1);
    expect(env.sentEmails[0]?.to).toBe("user@example.com");
    expect(env.sentEmails[0]?.subject).toBe("Reset your ShelfMarket password");
    expect(env.sentEmails[0]?.html).toContain("login?reset_token=reset-token-456");
    await expect(env.EMAIL_DEDUPE.get("sent:password-token-id")).resolves.not.toBeNull();
    await expect(getStats(env)).resolves.toMatchObject({
      processed: 1,
      emailsSent: 1,
    });
  });

  it("ignores CustomerEmailTokenCreated with missing tokenValue", async () => {
    const env = createTestEnv({ emailSendingEnabled: true });
    const message = createMessage({
      notificationType: "Message",
      id: "email-token-id",
      type: "CustomerEmailTokenCreated",
      customerId: "customer-id",
      customerEmail: "newuser@example.com",
    });

    await handleQueue(createBatch([message]), env);

    expect(message.acked).toBe(true);
    expect(env.sentEmails).toHaveLength(0);
    await expect(getStats(env)).resolves.toMatchObject({
      processed: 1,
      ignored: 1,
    });
  });

  it("sends internal email for successful PaymentTransactionAdded notifications", async () => {
    const env = createTestEnv({
      emailSendingEnabled: true,
      internalNotificationEmails: "ops@example.com",
    });
    const message = createPaymentTransactionAddedMessage();

    await handleQueue(createBatch([message]), env);

    expect(message.acked).toBe(true);
    expect(env.sentEmails).toEqual([
      expect.objectContaining({
        to: "ops@example.com",
        from: "orders@example.com",
        subject: "Payment transaction succeeded: payment-id",
      }),
    ]);
    expect(env.sentEmails[0]?.html).toContain(
      "https://mc.europe-west1.gcp.commercetools.com/shelfmarket/payments/payment-id",
    );
    expect(env.sentEmails[0]?.text).toContain("transaction-id");
    await expect(env.EMAIL_DEDUPE.get("sent:payment-added-id")).resolves.not.toBeNull();
    await expect(getStats(env)).resolves.toMatchObject({
      processed: 1,
      emailsSent: 1,
    });
  });

  it("sends internal email for successful PaymentTransactionStateChanged notifications", async () => {
    const env = createTestEnv({
      emailSendingEnabled: true,
      internalNotificationEmails: "ops@example.com,finance@example.com",
    });
    const message = createPaymentTransactionStateChangedMessage();

    await handleQueue(createBatch([message]), env);

    expect(message.acked).toBe(true);
    expect(env.sentEmails).toEqual([
      expect.objectContaining({ to: "ops@example.com" }),
      expect.objectContaining({ to: "finance@example.com" }),
    ]);
    expect(env.sentEmails[0]?.text).toContain("Payment ID: payment-id");
    expect(env.sentEmails[0]?.text).toContain("Transaction state: Success");
    await expect(env.EMAIL_DEDUPE.get("sent:payment-state-id")).resolves.not.toBeNull();
  });

  it("ignores non-Success Payment transaction notifications", async () => {
    const env = createTestEnv({ emailSendingEnabled: true });
    const message = createMessage({
      notificationType: "Message",
      id: "payment-state-id",
      type: "PaymentTransactionStateChanged",
      resource: { typeId: "payment", id: "payment-id" },
      transactionId: "transaction-id",
      state: "Pending",
    });

    await handleQueue(createBatch([message]), env);

    expect(message.acked).toBe(true);
    expect(env.sentEmails).toHaveLength(0);
    await expect(getStats(env)).resolves.toMatchObject({
      processed: 1,
      ignored: 1,
    });
  });

  it("ignores malformed Payment transaction notifications", async () => {
    const env = createTestEnv({ emailSendingEnabled: true });
    const message = createMessage({
      notificationType: "Message",
      id: "payment-state-id",
      type: "PaymentTransactionStateChanged",
      state: "Success",
    });

    await handleQueue(createBatch([message]), env);

    expect(message.acked).toBe(true);
    expect(env.sentEmails).toHaveLength(0);
    await expect(getStats(env)).resolves.toMatchObject({
      processed: 1,
      ignored: 1,
    });
  });

  it("skips duplicate Payment transaction notifications", async () => {
    const env = createTestEnv({
      emailSendingEnabled: true,
      internalNotificationEmails: "ops@example.com",
    });
    await env.EMAIL_DEDUPE.put("sent:payment-added-id", "already-sent");
    const message = createPaymentTransactionAddedMessage();

    await handleQueue(createBatch([message]), env);

    expect(message.acked).toBe(true);
    expect(env.sentEmails).toHaveLength(0);
    await expect(getStats(env)).resolves.toMatchObject({
      processed: 1,
      duplicate: 1,
    });
  });

  it("skips Payment transaction emails when sending is disabled", async () => {
    const env = createTestEnv({
      emailSendingEnabled: false,
      internalNotificationEmails: "ops@example.com",
    });
    const message = createPaymentTransactionAddedMessage();

    await handleQueue(createBatch([message]), env);

    expect(message.acked).toBe(true);
    expect(env.sentEmails).toHaveLength(0);
    await expect(env.EMAIL_DEDUPE.get("sent:payment-added-id")).resolves.toBeNull();
    await expect(getStats(env)).resolves.toMatchObject({
      processed: 1,
      disabled: 1,
    });
  });

  it("retries Payment transaction emails when sending fails", async () => {
    const env = createTestEnv({
      emailSendingEnabled: true,
      internalNotificationEmails: "ops@example.com",
      sendError: new Error("send failed"),
    });
    const message = createPaymentTransactionAddedMessage();

    await handleQueue(createBatch([message]), env);

    expect(message.acked).toBe(false);
    expect(message.retried).toBe(true);
    await expect(env.EMAIL_DEDUPE.get("sent:payment-added-id")).resolves.toBeNull();
    await expect(getStats(env)).resolves.toMatchObject({
      processed: 1,
      errors: 1,
    });
  });
});

type TestEnv = Env & {
  EMAIL_DEDUPE: FakeKV;
  EMAIL_QUEUE: FakeQueue;
  STATS: FakeStatsNamespace;
  sentEmails: Array<{
    to: string;
    from: string;
    subject: string;
    html: string;
    text: string;
  }>;
};

function createTestEnv(options: {
  emailSendingEnabled: boolean;
  sendError?: Error;
  internalNotificationEmails?: string;
}): TestEnv {
  const sentEmails: TestEnv["sentEmails"] = [];

  return {
    EMAIL_DEDUPE: new FakeKV(),
    EMAIL: {
      async send(message) {
        if (options.sendError) {
          throw options.sendError;
        }
        sentEmails.push(message);
        return { messageId: "email-message-id" };
      },
    },
    EMAIL_SENDING_ENABLED: String(options.emailSendingEnabled),
    FROM_EMAIL: "orders@example.com",
    INTERNAL_NOTIFICATION_EMAILS: options.internalNotificationEmails ?? "ops@example.com",
    DEDUPE_TTL_SECONDS: "2592000",
    STORE_URL: "https://shelfmarket.tylko.dev",
    DLQ_QUEUE_NAME: "email-events-dlq",
    STATS: new FakeStatsNamespace(),
    EMAIL_QUEUE: new FakeQueue(),
    sentEmails,
  } as TestEnv;
}

function createOrderCreatedMessage(): TestMessage {
  return createMessage({
    notificationType: "Message",
    id: "message-id",
    type: "OrderCreated",
    order: {
      id: "order-id",
      customerEmail: "customer@example.com",
      orderNumber: "ORD-1",
    },
  });
}

function createPaymentTransactionAddedMessage(): TestMessage {
  return createMessage({
    notificationType: "Message",
    id: "payment-added-id",
    type: "PaymentTransactionAdded",
    resource: { typeId: "payment", id: "payment-id" },
    resourceVersion: 12,
    sequenceNumber: 34,
    createdAt: "2026-06-20T12:00:00.000Z",
    transaction: {
      id: "transaction-id",
      type: "Charge",
      state: "Success",
      amount: { centAmount: 12345, currencyCode: "EUR" },
      interfaceId: "psp-transaction-id",
      interactionId: "psp-interaction-id",
    },
  });
}

function createPaymentTransactionStateChangedMessage(): TestMessage {
  return createMessage({
    notificationType: "Message",
    id: "payment-state-id",
    type: "PaymentTransactionStateChanged",
    resource: { typeId: "payment", id: "payment-id" },
    resourceVersion: 13,
    sequenceNumber: 35,
    transactionId: "transaction-id",
    state: "Success",
    createdAt: "2026-06-20T12:05:00.000Z",
  });
}

type TestMessage = Message<QueuePayload> & { acked: boolean; retried: boolean };

function createMessage(body: QueuePayload): TestMessage {
  return {
    id: "queue-message-id",
    timestamp: new Date(),
    body,
    attempts: 1,
    acked: false,
    retried: false,
    ack() {
      this.acked = true;
    },
    retry() {
      this.retried = true;
    },
  } as TestMessage;
}

function createBatch(messages: TestMessage[]): MessageBatch<QueuePayload> {
  return {
    queue: "commerce-notifications-email-dev",
    messages,
    ackAll() {
      for (const message of messages) message.ack();
    },
    retryAll() {
      throw new Error("retryAll should not be called");
    },
  } as unknown as MessageBatch<QueuePayload>;
}
