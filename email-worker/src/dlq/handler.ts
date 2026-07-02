import type { Env, QueuePayload } from "../env";
import { errorFields, logger } from "../shared/logger";
import { incrementStats } from "../stats/counters";
import { storeDlqMessage } from "./dlq-store";

/**
 * Consumes the dead-letter queue. Each exhausted message is:
 *   1. logged at error level (the primary alert signal), with an optional push
 *      to ALERT_WEBHOOK_URL for teams without log-based alerting;
 *   2. counted in the atomic `dlq` counter (visible in /stats);
 *   3. backed up to KV so it can be replayed once the root cause is fixed.
 *
 * The message is then acknowledged so the DLQ does not retain it; KV is the
 * replay backlog. A failed backup is logged prominently but does not retry
 * (there is no DLQ for the DLQ), since the error log has already fired.
 */
export async function handleDlq(batch: MessageBatch<QueuePayload>, env: Env): Promise<void> {
  // Process the batch concurrently so per-message webhook waits (bounded to 5s
  // each in fireAlertWebhook) overlap instead of stacking serially.
  await Promise.all(
    batch.messages.map(async (message) => {
      logger.error("email-worker dead-letter message received", {
        queueMessageId: message.id,
        notificationId: message.body?.id,
        type: message.body?.type,
        attempts: message.attempts,
      });

      await incrementStats(env, "dlq");

      await safeBackup(env, message);
      await fireAlertWebhook(env, message);

      message.ack();
    }),
  );
}

async function safeBackup(env: Env, message: Message<QueuePayload>): Promise<void> {
  try {
    await storeDlqMessage(env, message);
  } catch (error) {
    logger.error("email-worker dead-letter backup failed; message will not be replayable", {
      queueMessageId: message.id,
      ...errorFields(error),
    });
  }
}

async function fireAlertWebhook(env: Env, message: Message<QueuePayload>): Promise<void> {
  if (!env.ALERT_WEBHOOK_URL) return;
  try {
    await fetch(env.ALERT_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "email-worker",
        queueName: env.DLQ_QUEUE_NAME,
        queueMessageId: message.id,
        notificationId: message.body?.id,
        type: message.body?.type,
        attempts: message.attempts,
      }),
      // Bound the wait so a slow/hanging webhook cannot stall DLQ processing.
      signal: AbortSignal.timeout(5_000),
    });
  } catch (error) {
    logger.warn("email-worker alert webhook delivery failed", {
      queueMessageId: message.id,
      ...errorFields(error),
    });
  }
}
