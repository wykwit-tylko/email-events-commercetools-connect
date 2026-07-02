import { dlqReplayTtlSeconds, type Env, type QueuePayload } from "../env";
import { logger } from "../shared/logger";
import { mapLimit } from "../shared/concurrency";

/**
 * Dead-lettered messages are consumed out of the DLQ (so it cannot grow without
 * bound) and backed up in KV under `dlq:<queueMessageId>` for inspection and
 * replay. KV is the replay backlog; a TTL bounds its size.
 */

export type DlqRecord = {
  queueMessageId: string;
  notificationId?: unknown;
  type?: unknown;
  attempts: number;
  queuedAt: string;
  body: QueuePayload;
};

export const DLQ_PREFIX = "dlq:";

export function dlqKey(queueMessageId: string): string {
  return `${DLQ_PREFIX}${queueMessageId}`;
}

export async function storeDlqMessage(
  env: Env,
  message: Message<QueuePayload>,
): Promise<void> {
  const record: DlqRecord = {
    queueMessageId: message.id,
    notificationId: message.body?.id,
    type: message.body?.type,
    attempts: message.attempts,
    queuedAt: new Date().toISOString(),
    body: message.body,
  };
  await env.EMAIL_DEDUPE.put(dlqKey(message.id), JSON.stringify(record), {
    expirationTtl: dlqReplayTtlSeconds(env),
  });
  logger.info("email-worker dead-letter message backed up for replay", {
    dlqKey: dlqKey(message.id),
    queueMessageId: message.id,
  });
}

export async function listDlqRecords(env: Env, limit?: number): Promise<DlqRecord[]> {
  const records: DlqRecord[] = [];
  let cursor: string | undefined;
  // KV list() returns at most 1000 keys per call; page through the cursor so a
  // large backlog is fully visible to /admin/dlq and fully replayable. Cap the
  // keys per page at `limit` when provided so callers can bound their work.
  const pageSize = limit ? Math.min(limit, 1000) : 1000;
  do {
    const listed = await env.EMAIL_DEDUPE.list({ prefix: DLQ_PREFIX, cursor, limit: pageSize });
    if (listed.keys.length === 0) break;
    // Fetch the page's keys with bounded concurrency rather than fanning out
    // unbounded Promise.all (a full page can be 1000 concurrent KV gets).
    const entries = await mapLimit(listed.keys, KV_GET_CONCURRENCY, async (entry) => ({
      key: entry.name,
      raw: await env.EMAIL_DEDUPE.get(entry.name),
    }));
    for (const { key, raw } of entries) {
      if (!raw) continue;
      try {
        records.push(JSON.parse(raw) as DlqRecord);
      } catch {
        logger.warn("email-worker dead-letter record was not valid JSON", {
          dlqKey: key,
        });
      }
    }
    cursor = listed.list_complete ? undefined : listed.cursor;
    if (limit && records.length >= limit) break;
  } while (cursor);
  return records;
}

export async function deleteDlqRecord(env: Env, queueMessageId: string): Promise<void> {
  await env.EMAIL_DEDUPE.delete(dlqKey(queueMessageId));
}

/** Max concurrent KV reads; bounds subrequest fan-out within a single page. */
const KV_GET_CONCURRENCY = 50;
