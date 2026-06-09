import { markSent, wasAlreadySent } from '../dedupe/kv-dedupe-store';
import { sendEmail } from '../email/cloudflare-email';
import { emailSendingEnabled, type EnqueuedCommerceNotification, type Env } from '../env';
import {
  isOrderCreatedNotification,
} from '../notifications/platform-message';
import { renderOrderCreatedEmail } from '../templates/order-created';
import { errorFields, logger } from '../shared/logger';

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

  logger.info('email-worker processing message', {
    queueMessageId: message.id,
    notificationType: notification?.notificationType,
    type: notification?.type,
    notificationId: notification?.id,
  });

  if (!isOrderCreatedNotification(notification)) {
    logger.info('email-worker ignored commerce notification', {
      queueMessageId: message.id,
      notificationType: notification?.notificationType,
      type: notification?.type,
    });
    message.ack();
    return;
  }

  logger.info('email-worker order created notification matched', {
    queueMessageId: message.id,
    notificationId: notification.id,
    to: notification.order.customerEmail,
  });

  if (await wasAlreadySent(env, notification.id)) {
    logger.info('email-worker skipped duplicate notification', {
      notificationId: notification.id,
    });
    message.ack();
    return;
  }

  logger.info('email-worker dedupe passed', {
    notificationId: notification.id,
  });

  if (!emailSendingEnabled(env)) {
    logger.info('email-worker email sending disabled', {
      notificationId: notification.id,
      to: notification.order.customerEmail,
    });
    message.ack();
    return;
  }

  logger.info('email-worker sending email', {
    notificationId: notification.id,
    to: notification.order.customerEmail,
  });

  try {
    await sendEmail(env, {
      to: notification.order.customerEmail,
      email: renderOrderCreatedEmail(notification),
    });
    await markSent(env, notification.id);
    logger.info('email-worker email sent and dedupe recorded', {
      notificationId: notification.id,
      to: notification.order.customerEmail,
    });
  } catch (error) {
    logger.error('email-worker send failed', {
      notificationId: notification.id,
      to: notification.order.customerEmail,
      ...errorFields(error),
    });
  }

  message.ack();
}
