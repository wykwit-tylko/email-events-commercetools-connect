import { type CommerceNotification, type Env, type QueuePayload } from '../env';
import { handleCustomerEmailVerification } from '../notifications/customer-email-verification/handler';
import { handleCustomerPasswordReset } from '../notifications/customer-password-reset/handler';
import { handleOrderCreated } from '../notifications/order-created/handler';
import { errorFields, logger } from '../shared/logger';
import { incrementStats } from '../stats/counters';

export async function handleQueue(
  batch: MessageBatch<QueuePayload>,
  env: Env,
): Promise<void> {
  for (const message of batch.messages) {
    try {
      await handleQueueMessage(message as Message<CommerceNotification>, env);
    } catch (error) {
      // One broken message must not fail the whole batch; retry it alone.
      logger.error('email-worker unexpected message handling failure', {
        queueMessageId: message.id,
        ...errorFields(error),
      });
      message.retry();
    }
  }
}

async function handleQueueMessage(
  message: Message<CommerceNotification>,
  env: Env,
): Promise<void> {
  const notification = message.body;

  await incrementStats(env, 'processed');

  logger.info('email-worker processing message', {
    queueMessageId: message.id,
    notificationType: notification?.notificationType,
    type: notification?.type,
    notificationId: notification?.id,
  });

  switch (notification?.type) {
    case 'OrderCreated':
      await handleOrderCreated(message, env);
      return;

    case 'CustomerEmailTokenCreated':
      await handleCustomerEmailVerification(message, env);
      return;

    case 'CustomerPasswordTokenCreated':
      await handleCustomerPasswordReset(message, env);
      return;

    default:
      await incrementStats(env, 'ignored');
      logger.info('email-worker ignored commerce notification', {
        queueMessageId: message.id,
        notificationType: notification?.notificationType,
        type: notification?.type,
      });
      message.ack();
  }
}
