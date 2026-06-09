import type { EnqueuedCommerceNotification, Env } from './env';
import { handleQueue } from './queue/handler';
import { logger } from './shared/logger';

export default {
  async fetch(): Promise<Response> {
    return new Response('Email Worker is a queue consumer', { status: 200 });
  },

  async queue(
    batch: MessageBatch<EnqueuedCommerceNotification>,
    env: Env,
  ): Promise<void> {
    logger.info('email-worker queue batch received', {
      queueName: batch.queue,
      messageCount: batch.messages.length,
    });

    await handleQueue(batch, env);

    logger.info('email-worker queue batch completed', {
      queueName: batch.queue,
      messageCount: batch.messages.length,
    });
  },
} satisfies ExportedHandler<Env, EnqueuedCommerceNotification>;
