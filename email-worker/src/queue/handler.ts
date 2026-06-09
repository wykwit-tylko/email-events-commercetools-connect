import { markSent, wasAlreadySent } from '../dedupe/kv-dedupe-store';
import { sendEmail } from '../email/cloudflare-email';
import { emailSendingEnabled, type EnqueuedCommerceNotification, type Env } from '../env';
import {
  isOrderCreatedNotification,
} from '../notifications/platform-message';
import { renderOrderCreatedEmail } from '../templates/order-created';

export async function handleQueue(
  batch: MessageBatch<EnqueuedCommerceNotification>,
  env: Env,
): Promise<void> {
  for (const message of batch.messages) {
    await handleQueueMessage(message, env);
  }
}

async function handleQueueMessage(
  message: Message<EnqueuedCommerceNotification>,
  env: Env,
): Promise<void> {
  const notification = message.body;

  if (!isOrderCreatedNotification(notification)) {
    console.log('email-worker ignored commerce notification', {
      queueMessageId: message.id,
      notificationType: notification?.notificationType,
      type: notification?.type,
    });
    message.ack();
    return;
  }

  if (await wasAlreadySent(env, notification.id)) {
    console.log('email-worker skipped duplicate notification', {
      notificationId: notification.id,
    });
    message.ack();
    return;
  }

  if (!emailSendingEnabled(env)) {
    console.log('email-worker email sending disabled', {
      notificationId: notification.id,
      to: notification.order.customerEmail,
    });
    message.ack();
    return;
  }

  try {
    await sendEmail(env, {
      to: notification.order.customerEmail,
      email: renderOrderCreatedEmail(notification),
    });
    await markSent(env, notification.id);
  } catch (error) {
    console.error('email-worker send failed', {
      notificationId: notification.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  message.ack();
}
