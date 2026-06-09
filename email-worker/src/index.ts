import type { EnqueuedCommerceNotification, Env } from './env';
import { handleQueue } from './queue/handler';

export default {
  async fetch(): Promise<Response> {
    return new Response('Email Worker is a queue consumer', { status: 200 });
  },

  async queue(
    batch: MessageBatch<EnqueuedCommerceNotification>,
    env: Env,
  ): Promise<void> {
    await handleQueue(batch, env);
  },
} satisfies ExportedHandler<Env, EnqueuedCommerceNotification>;
