import { markSent, wasAlreadySent } from "../../dedupe/kv-dedupe-store";
import {
  emailSendingEnabled,
  internalNotificationEmails,
  type CommerceNotification,
  type Env,
} from "../../env";
import { errorFields, logger } from "../../shared/logger";
import { incrementStats } from "../../stats/counters";
import {
  renderPaymentTransactionInternalEmail,
  type PaymentTransactionInternalNotification,
} from "./template";

export function isSuccessfulPaymentTransactionNotification(
  notification: CommerceNotification | undefined,
): notification is PaymentTransactionInternalNotification {
  if (
    notification?.notificationType !== "Message" ||
    typeof notification.id !== "string" ||
    !isPaymentReference(notification.resource)
  ) {
    return false;
  }

  if (notification.type === "PaymentTransactionStateChanged") {
    return notification.state === "Success";
  }

  if (notification.type === "PaymentTransactionAdded") {
    return isRecord(notification.transaction) && notification.transaction.state === "Success";
  }

  return false;
}

export async function handlePaymentTransactionInternal(
  message: Message<CommerceNotification>,
  env: Env,
): Promise<void> {
  const notification = message.body;

  if (!isSuccessfulPaymentTransactionNotification(notification)) {
    await incrementStats(env, "ignored");
    logger.info("email-worker ignored payment transaction notification", {
      queueMessageId: message.id,
      notificationType: notification?.notificationType,
      type: notification?.type,
    });
    message.ack();
    return;
  }

  const paymentId = notification.resource.id;
  logger.info("email-worker payment transaction notification matched", {
    queueMessageId: message.id,
    notificationId: notification.id,
    type: notification.type,
    paymentId,
  });

  if (await wasAlreadySent(env, notification.id)) {
    await incrementStats(env, "duplicate");
    logger.info("email-worker skipped duplicate notification", {
      notificationId: notification.id,
    });
    message.ack();
    return;
  }

  const recipients = internalNotificationEmails(env);
  if (recipients.length === 0) {
    await incrementStats(env, "disabled");
    logger.info("email-worker internal payment recipients missing", {
      notificationId: notification.id,
      paymentId,
    });
    message.ack();
    return;
  }

  if (!emailSendingEnabled(env)) {
    await incrementStats(env, "disabled");
    logger.info("email-worker email sending disabled", {
      notificationId: notification.id,
      paymentId,
    });
    message.ack();
    return;
  }

  try {
    const email = renderPaymentTransactionInternalEmail(notification, env.STORE_URL);
    for (const recipient of recipients) {
      logger.info("email-worker calling email binding", {
        to: recipient,
        from: env.FROM_EMAIL,
        subject: email.subject,
      });
      await env.EMAIL.send({
        to: recipient,
        from: env.FROM_EMAIL,
        subject: email.subject,
        html: email.html,
        text: email.text,
      });
    }
  } catch (error) {
    await incrementStats(env, "errors");
    logger.error("email-worker send failed", {
      notificationId: notification.id,
      paymentId,
      ...errorFields(error),
    });
    message.retry();
    return;
  }

  logger.info("email-worker email binding returned", {
    notificationId: notification.id,
    recipientCount: recipients.length,
  });

  try {
    await markSent(env, notification.id);
    await incrementStats(env, "emailsSent");
    logger.info("email-worker email sent and dedupe recorded", {
      notificationId: notification.id,
      paymentId,
      recipientCount: recipients.length,
    });
  } catch (error) {
    logger.error("email-worker failed to record sent state after send", {
      notificationId: notification.id,
      ...errorFields(error),
    });
  }

  message.ack();
}

function isPaymentReference(value: unknown): value is { typeId: "payment"; id: string } {
  if (!isRecord(value)) {
    return false;
  }
  return value.typeId === "payment" && typeof value.id === "string" && value.id.length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
