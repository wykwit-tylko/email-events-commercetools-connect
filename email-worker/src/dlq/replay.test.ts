import { describe, expect, it } from "vitest";
import type { Env, QueuePayload } from "../env";
import { storeDlqMessage } from "./dlq-store";
import { replayDlq } from "./replay";
import { FakeKV, FakeQueue } from "../../test/fakes";

describe("replayDlq", () => {
  it("re-enqueues backed-up messages onto the main queue and clears them", async () => {
    const env = createEnv();
    await storeDlqMessage(env, dlqMessage("q-1", { id: "n-1", type: "OrderCreated" }));
    await storeDlqMessage(env, dlqMessage("q-2", { id: "n-2", type: "OrderCreated" }));

    const result = await replayDlq(env);

    expect(result).toEqual({ replayed: 2, failed: 0, remaining: false });
    expect(env.EMAIL_QUEUE.sent).toHaveLength(2);
    expect([...env.EMAIL_QUEUE.sent.map((m) => m.id)].sort()).toEqual(["n-1", "n-2"]);
    await expect(env.EMAIL_DEDUPE.list({ prefix: "dlq:" })).resolves.toMatchObject({
      keys: [],
    });
  });

  it("retains records that fail to re-enqueue and reports the failure", async () => {
    const env = createEnv();
    await storeDlqMessage(env, dlqMessage("q-1", { id: "n-1" }));
    await storeDlqMessage(env, dlqMessage("q-2", { id: "n-2" }));
    env.EMAIL_QUEUE.failOnNext();

    const result = await replayDlq(env);

    expect(result).toEqual({ replayed: 1, failed: 1, remaining: false });
    expect(env.EMAIL_QUEUE.sent).toHaveLength(1);
    // The failed record stays for a later retry; the succeeded one is gone.
    const remaining = await env.EMAIL_DEDUPE.list({ prefix: "dlq:" });
    expect(remaining.keys).toHaveLength(1);
  });

  it("replays nothing when there is no backlog", async () => {
    const env = createEnv();
    const result = await replayDlq(env);
    expect(result).toEqual({ replayed: 0, failed: 0, remaining: false });
    expect(env.EMAIL_QUEUE.sent).toHaveLength(0);
  });

  it("processes a bounded batch and reports remaining when the backlog exceeds the cap", async () => {
    const env = createEnv();
    // A backlog larger than the per-invocation cap cannot drain in a single call.
    for (let i = 0; i < 250; i++) {
      await storeDlqMessage(env, dlqMessage(`q-${i}`, { id: `n-${i}` }));
    }

    const result = await replayDlq(env);

    expect(result.remaining).toBe(true);
    expect(result.replayed).toBeGreaterThan(0);
    // Not everything drained in one call — the rest needs another POST.
    const after = await env.EMAIL_DEDUPE.list({ prefix: "dlq:" });
    expect(after.keys.length).toBeGreaterThan(0);
  });
});

type TestEnv = Env & {
  EMAIL_DEDUPE: FakeKV;
  EMAIL_QUEUE: FakeQueue;
  STATS: unknown;
};

function createEnv(): TestEnv {
  return {
    EMAIL_DEDUPE: new FakeKV(),
    EMAIL: { async send() { return { messageId: "x" }; } },
    EMAIL_SENDING_ENABLED: "true",
    FROM_EMAIL: "orders@example.com",
    DEDUPE_TTL_SECONDS: "2592000",
    STORE_URL: "https://shelfmarket.tylko.dev",
    STATS: {},
    EMAIL_QUEUE: new FakeQueue(),
    DLQ_QUEUE_NAME: "email-events-dlq",
  } as unknown as TestEnv;
}

function dlqMessage(id: string, body: QueuePayload): Message<QueuePayload> {
  return { id, timestamp: new Date(), body, attempts: 6 } as Message<QueuePayload>;
}
