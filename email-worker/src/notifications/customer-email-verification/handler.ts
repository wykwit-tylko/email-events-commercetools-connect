import { markSent, wasAlreadySent } from '../../dedupe/kv-dedupe-store';
import { emailSendingEnabled, type CommerceNotification, type Env } from '../../env';
import { errorFields, logger } from '../../shared/logger';
import { incrementStats } from '../../stats/counters';
import {
  renderEmailVerification,
  type CustomerEmailTokenCreatedNotification,
} from './template';

export function isCustomerEmailTokenCreatedNotification(
  notification: CommerceNotification | undefined,
): notification is CustomerEmailTokenCreatedNotification {
  return (
    notification?.notificationType === 'Message' &&
    typeof notification.id === 'string' &&
    notification.type === 'CustomerEmailTokenCreated' &&
    typeof notification.customerId === 'string' &&
    typeof notification.customerEmail === 'string' &&
    notification.customerEmail.length > 0 &&
    typeof notification.value === 'string'
  );
}

export async function handleCustomerEmailVerification(
  message: Message<CommerceNotification>,
  env: Env,
): Promise<void> {
  const notification = message.body;

  if (!isCustomerEmailTokenCreatedNotification(notification)) {
    await incrementStats(env, 'ignored');
    logger.info('email-worker ignored invalid email verification notification', {
      queueMessageId: message.id,
      notificationType: notification?.notificationType,
      type: notification?.type,
    });
    message.ack();
    return;
  }

  logger.info('email-worker email verification notification matched', {
    queueMessageId: message.id,
    notificationId: notification.id,
    to: notification.customerEmail,
  });

  if (await wasAlreadySent(env, notification.id)) {
    await incrementStats(env, 'duplicate');
    logger.info('email-worker skipped duplicate notification', {
      notificationId: notification.id,
    });
    message.ack();
    return;
  }

  if (!emailSendingEnabled(env)) {
    await incrementStats(env, 'disabled');
    logger.info('email-worker email sending disabled', {
      notificationId: notification.id,
      to: notification.customerEmail,
    });
    message.ack();
    return;
  }

  try {
    const email = renderEmailVerification(notification, env.STORE_URL);
    logger.info('email-worker calling email binding', {
      to: notification.customerEmail,
      from: env.FROM_EMAIL,
      subject: email.subject,
    });
    await env.EMAIL.send({
      to: notification.customerEmail,
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
      to: notification.customerEmail,
    });
  } catch (error) {
    await incrementStats(env, 'errors');
    logger.error('email-worker send failed', {
      notificationId: notification.id,
      to: notification.customerEmail,
      ...errorFields(error),
    });
  }

  message.ack();
}
