import { markSent, wasAlreadySent } from '../../dedupe/kv-dedupe-store';
import { emailSendingEnabled, type CommerceNotification, type Env } from '../../env';
import { errorFields, logger } from '../../shared/logger';
import { incrementStats } from '../../stats/counters';
import {
  renderOrderCreatedEmail,
  type OrderCreatedNotification,
} from './template';

export function isOrderCreatedNotification(
  notification: CommerceNotification | undefined,
): notification is OrderCreatedNotification {
  return (
    notification?.notificationType === 'Message' &&
    typeof notification.id === 'string' &&
    notification.type === 'OrderCreated' &&
    isOrderWithCustomerEmail(notification.order)
  );
}

export async function handleOrderCreated(
  message: Message<CommerceNotification>,
  env: Env,
): Promise<void> {
  const notification = message.body;

  if (!isOrderCreatedNotification(notification)) {
    await incrementStats(env, 'ignored');
    logger.info('email-worker ignored invalid order created notification', {
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
    await incrementStats(env, 'duplicate');
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
    await incrementStats(env, 'disabled');
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
    const email = renderOrderCreatedEmail(notification, env.STORE_URL);
    logger.info('email-worker calling email binding', {
      to: notification.order.customerEmail,
      from: env.FROM_EMAIL,
      subject: email.subject,
    });
    await env.EMAIL.send({
      to: notification.order.customerEmail,
      from: env.FROM_EMAIL,
      subject: email.subject,
      html: email.html,
      text: email.text,
    });
    logger.info('email-worker email binding returned');
    await markSent(env, notification.id);
    await incrementStats(env, 'emailsSent');
    logger.info('email-worker email sent and dedupe recorded', {
      notificationId: notification.id,
      to: notification.order.customerEmail,
    });
  } catch (error) {
    await incrementStats(env, 'errors');
    logger.error('email-worker send failed', {
      notificationId: notification.id,
      to: notification.order.customerEmail,
      ...errorFields(error),
    });
  }

  message.ack();
}

function isOrderWithCustomerEmail(value: unknown): value is {
  id: string;
  customerEmail: string;
  orderNumber?: string;
} {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const order = value as Record<string, unknown>;
  return (
    typeof order.id === 'string' &&
    order.id.length > 0 &&
    typeof order.customerEmail === 'string' &&
    order.customerEmail.length > 0 &&
    optionalString(order.orderNumber)
  );
}

function optionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}
