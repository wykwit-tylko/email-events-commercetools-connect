import type { Env } from "../env";
import { mapLimit } from "../shared/concurrency";
import { errorFields, logger } from "../shared/logger";
import { deleteDlqRecord, listDlqRecords } from "./dlq-store";

export type ReplayResult = {
  replayed: number;
  failed: number;
  /** More backed-up records exist; POST /admin/replay-dlq again to drain them. */
  remaining: boolean;
};

/** Max records re-sent per invocation; keeps total subrequests under the cap. */
const REPLAY_BATCH_SIZE = 200;
/** Max concurrent re-sends within a batch. */
const REPLAY_CONCURRENCY = 25;

/**
 * Re-enqueues backed-up dead-lettered messages back onto the main queue,
 * deleting each KV record as it is successfully re-sent. Re-processed messages
 * re-enter normal handling, and a message that fails again for the same root
 * cause will return to the DLQ. Call this only after fixing the underlying
 * failure.
 *
 * Note on deduplication: a message only reaches the DLQ after the email send
 * failed repeatedly, and `markSent` is only recorded after a *successful* send
 * (a `markSent` failure acks rather than retries). A dead-lettered message
 * therefore has no dedupe key, so replay always re-sends — dedupe does NOT make
 * replay idempotent. That is the intended trade-off (prefer a rare duplicate
 * email over silently dropping a dead-lettered message).
 *
 * Bounded: each call re-sends at most `REPLAY_BATCH_SIZE` records with bounded
 * concurrency, so a large backlog drains over several calls without exceeding
 * the per-invocation subrequest cap. The response's `remaining` indicates
 * whether another call is needed.
 */
export async function replayDlq(env: Env): Promise<ReplayResult> {
  // Fetch one extra record so we can tell whether a larger backlog remains
  // without spending another subrequest on a separate count.
  const records = await listDlqRecords(env, REPLAY_BATCH_SIZE + 1);
  const remaining = records.length > REPLAY_BATCH_SIZE;

  let replayed = 0;
  let failed = 0;
  await mapLimit(records, REPLAY_CONCURRENCY, async (record) => {
    try {
      await env.EMAIL_QUEUE.send(record.body);
      await deleteDlqRecord(env, record.queueMessageId);
      replayed += 1;
      logger.info("email-worker dead-letter message replayed", {
        queueMessageId: record.queueMessageId,
        notificationId: record.body?.id,
        type: record.body?.type,
      });
    } catch (error) {
      failed += 1;
      logger.error("email-worker dead-letter replay failed; record retained", {
        queueMessageId: record.queueMessageId,
        ...errorFields(error),
      });
    }
  });

  logger.info("email-worker dead-letter replay complete", { replayed, failed, remaining });
  return { replayed, failed, remaining };
}
