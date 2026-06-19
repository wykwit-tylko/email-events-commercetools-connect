import { describe, expect, it } from "vitest";
import {
  buildWebhookCanonicalMessage,
  signWebhook,
  WEBHOOK_SIGNATURE_VERSION,
} from "./webhook-signing";

describe("buildWebhookCanonicalMessage", () => {
  it("joins version, timestamp, id and body with newlines", () => {
    expect(
      buildWebhookCanonicalMessage({
        timestamp: "1700000000",
        messageId: "msg-1",
        body: '{"type":"OrderCreated"}',
      }),
    ).toBe('webhook-v1\n1700000000\nmsg-1\n{"type":"OrderCreated"}');
  });

  it("starts with the signature version for domain separation", () => {
    const message = buildWebhookCanonicalMessage({
      timestamp: "1",
      messageId: "id",
      body: "b",
    });
    expect(message.startsWith(WEBHOOK_SIGNATURE_VERSION)).toBe(true);
  });
});

describe("signWebhook", () => {
  // Pinned cross-repo contract: the shelfmarket receiver must reproduce this
  // exact digest for the same secret and canonical message. If this vector
  // changes, the receiver's KAT must change in lockstep.
  it("matches the known-answer vector", async () => {
    await expect(
      signWebhook("email-event-secret", {
        timestamp: "1700000000",
        messageId: "msg-1",
        body: '{"type":"OrderCreated"}',
      }),
    ).resolves.toBe("7967cb754179bcec0062ab9d1cdcf24aad89b2b07e398f291807d63bf7e396d8");
  });
});
