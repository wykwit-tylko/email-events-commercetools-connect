import { describe, expect, it } from "vitest";
import type { Env, QueuePayload } from "../env";
import { deleteDlqRecord, dlqKey, listDlqRecords, storeDlqMessage } from "./dlq-store";
import { FakeKV } from "../../test/fakes";

function makeEnv(kv: FakeKV): Env {
  return { EMAIL_DEDUPE: kv } as unknown as Env;
}

describe("dlq-store", () => {
  it("lists every record across multiple KV pages", async () => {
    // Three records with pageSize 2 forces two list() calls.
    const kv = new FakeKV({
      pageSize: 2,
      entries: [
        ["dlq:1", { queueMessageId: "1", attempts: 6, queuedAt: "t", body: { id: "n-1" } }],
        ["dlq:2", { queueMessageId: "2", attempts: 6, queuedAt: "t", body: { id: "n-2" } }],
        ["dlq:3", { queueMessageId: "3", attempts: 6, queuedAt: "t", body: { id: "n-3" } }],
      ],
    });

    const records = await listDlqRecords(makeEnv(kv));

    expect(records.map((r) => r.queueMessageId).sort()).toEqual(["1", "2", "3"]);
  });

  it("stores, lists, and deletes a dead-lettered message", async () => {
    const env = makeEnv(new FakeKV());
    const message = {
      id: "q-1",
      timestamp: new Date(),
      body: { id: "n-1", type: "OrderCreated" } as QueuePayload,
      attempts: 6,
    } as Message<QueuePayload>;

    await storeDlqMessage(env, message);
    expect(await listDlqRecords(env)).toHaveLength(1);

    await deleteDlqRecord(env, "q-1");
    expect(await listDlqRecords(env)).toHaveLength(0);
  });

  it("skips records that are not valid JSON without throwing", async () => {
    const kv = new FakeKV();
    await kv.put(dlqKey("bad"), "{not json");
    const records = await listDlqRecords(makeEnv(kv));
    expect(records).toHaveLength(0);
  });
});
