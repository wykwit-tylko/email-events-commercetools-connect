import { handleDlq } from "./dlq/handler";
import { listDlqRecords } from "./dlq/dlq-store";
import { replayDlq } from "./dlq/replay";
import type { Env, QueuePayload } from "./env";
import { handleQueue } from "./queue/handler";
import { getStats } from "./stats/counters";
import { logger } from "./shared/logger";

export { StatsDurableObject } from "./stats/stats-do";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/stats") {
      const stats = await getStats(env);
      return json(stats);
    }

    if (url.pathname === "/admin/dlq" && request.method === "GET") {
      return requireAdmin(request, env, async () => {
        const records = await listDlqRecords(env);
        return json({ count: records.length, records });
      });
    }

    if (url.pathname === "/admin/replay-dlq" && request.method === "POST") {
      return requireAdmin(request, env, async () => json(await replayDlq(env)));
    }

    return new Response("Email Worker is a queue consumer", { status: 200 });
  },

  async queue(batch: MessageBatch<QueuePayload>, env: Env): Promise<void> {
    // DLQ_QUEUE_NAME must be set whenever a DLQ consumer is configured in
    // wrangler.toml; without it, dead-letter batches fall through to normal
    // handling here and would be re-sent (duplicate emails). Fail loud via logs
    // so the misconfiguration is alertable instead of silently misrouting.
    if (!env.DLQ_QUEUE_NAME) {
      logger.error(
        "email-worker DLQ_QUEUE_NAME is not set; dead-letter batches cannot be routed safely and may be re-processed as new",
        { queueName: batch.queue, messageCount: batch.messages.length },
      );
    }
    if (batch.queue === env.DLQ_QUEUE_NAME) {
      logger.info("email-worker dead-letter batch received", {
        queueName: batch.queue,
        messageCount: batch.messages.length,
      });
      await handleDlq(batch, env);
      logger.info("email-worker dead-letter batch completed", {
        queueName: batch.queue,
        messageCount: batch.messages.length,
      });
      return;
    }

    logger.info("email-worker queue batch received", {
      queueName: batch.queue,
      messageCount: batch.messages.length,
    });

    await handleQueue(batch, env);

    logger.info("email-worker queue batch completed", {
      queueName: batch.queue,
      messageCount: batch.messages.length,
    });
  },
} satisfies ExportedHandler<Env, QueuePayload>;

function json(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

async function requireAdmin(
  request: Request,
  env: Env,
  handler: () => Promise<Response>,
): Promise<Response> {
  if (!env.ADMIN_TOKEN) {
    return new Response("Admin endpoints disabled (ADMIN_TOKEN not set)", { status: 404 });
  }
  const presented = request.headers.get("authorization") ?? "";
  if (!constantTimeEqual(presented, `Bearer ${env.ADMIN_TOKEN}`)) {
    return new Response("Unauthorized", { status: 401 });
  }
  return handler();
}

/** Constant-time string compare to avoid leaking token length/content via timing. */
function constantTimeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  // Pad both to the same length so the loop runs for max(a,b) regardless of input.
  const len = Math.max(aBytes.length, bBytes.length);
  let diff = 0;
  for (let i = 0; i < len; i++) {
    diff |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
  }
  return diff === 0;
}
