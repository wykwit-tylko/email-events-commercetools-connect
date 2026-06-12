import { markSent, wasAlreadySent } from '../../dedupe/kv-dedupe-store';
import { emailSendingEnabled, type CommerceNotification, type Env } from '../../env';
import { errorFields, logger } from '../../shared/logger';
import { incrementStats } from '../../stats/counters';
import {
  renderPasswordResetEmail,
  type CustomerPasswordTokenCreatedNotification,
} from './template';

export function isCustomerPasswordTokenCreatedNotification(
  notification: CommerceNotification | undefined,
): notification is CustomerPasswordTokenCreatedNotification {
  return (
    notification?.notificationType === 'Message' &&
    typeof notification.id === 'string' &&
    notification.type === 'CustomerPasswordTokenCreated' &&
    typeof notification.customerId === 'string' &&
    typeof notification.customerEmail === 'string' &&
    notification.customerEmail.length > 0 &&
    typeof notification.value === 'string'
  );
}

export async function handleCustomerPasswordReset(
  message: Message<CommerceNotification>,
  env: Env,
): Promise<void> {
  const notification = message.body;

  if (!isCustomerPasswordTokenCreatedNotification(notification)) {
    await incrementStats(env, 'ignored');
    logger.info('email-worker ignored invalid password reset notification', {
      queueMessageId: message.id,
      notificationType: notification?.notificationType,
      type: notification?.type,
    });
    message.ack();
    return;
  }

  logger.info('email-worker password reset notification matched', {
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
    const email = renderPasswordResetEmail(notification, env.STORE_URL);
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
  } catch (error) {
    await incrementStats(env, 'errors');
    logger.error('email-worker send failed', {
      notificationId: notification.id,
      to: notification.customerEmail,
      ...errorFields(error),
    });
    // Transient Email API failures must not drop emails; let the queue redeliver.
    message.retry();
    return;
  }

  logger.info('email-worker email binding returned');

  try {
    await markSent(env, notification.id);
    await incrementStats(env, 'emailsSent');
    logger.info('email-worker email sent and dedupe recorded', {
      notificationId: notification.id,
      to: notification.customerEmail,
    });
  } catch (error) {
    // The email is already out; prefer a rare duplicate on redelivery over loss.
    logger.error('email-worker failed to record sent state after send', {
      notificationId: notification.id,
      ...errorFields(error),
    });
  }

  message.ack();
}
