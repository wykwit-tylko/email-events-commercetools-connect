import {
  ctaButton,
  escapeHtml,
  linkFallback,
  paragraph,
  renderShelfMarketHtml,
  type RenderedEmail,
} from "../../templates/layout";

export type { RenderedEmail };

const MERCHANT_CENTER_BASE_URL = "https://mc.europe-west1.gcp.commercetools.com/shelfmarket";

type PaymentReference = {
  typeId: "payment";
  id: string;
};

type PaymentTransactionBaseNotification = {
  notificationType: "Message";
  id: string;
  resource: PaymentReference;
  resourceVersion?: unknown;
  sequenceNumber?: unknown;
  createdAt?: unknown;
};

export type PaymentTransactionAddedNotification = PaymentTransactionBaseNotification & {
  type: "PaymentTransactionAdded";
  transaction: Record<string, unknown> & { state: "Success" };
};

export type PaymentTransactionStateChangedNotification = PaymentTransactionBaseNotification & {
  type: "PaymentTransactionStateChanged";
  state: "Success";
  transactionId?: unknown;
};

export type PaymentTransactionInternalNotification =
  | PaymentTransactionAddedNotification
  | PaymentTransactionStateChangedNotification;

export function renderPaymentTransactionInternalEmail(
  notification: PaymentTransactionInternalNotification,
  storeUrl: string,
): RenderedEmail {
  const paymentId = notification.resource.id;
  const paymentUrl = merchantCenterPaymentUrl(paymentId);
  const subject = `Payment transaction succeeded: ${paymentId}`;
  const facts = paymentTransactionFacts(notification, paymentUrl);

  const bodyHtml = [
    paragraph(
      "A successful Payment transaction Commerce Notification was received. Inspect the Payment in Merchant Center to resolve the related Order and decide what internal action is needed.",
    ),
    ctaButton("Open Payment in Merchant Center", paymentUrl),
    linkFallback(paymentUrl),
    factsTable(facts),
  ].join("\n");

  return {
    subject,
    html: renderShelfMarketHtml(
      {
        eyebrow: "Internal payment",
        title: "Payment transaction succeeded.",
        bodyHtml,
        footerNote: `Internal notification for Payment ${paymentId}.`,
      },
      storeUrl,
    ),
    text: `Payment transaction succeeded\n\nA successful Payment transaction Commerce Notification was received. Inspect the Payment in Merchant Center to resolve the related Order and decide what internal action is needed.\n\n${paymentUrl}\n\n${factsText(facts)}`,
  };
}

function merchantCenterPaymentUrl(paymentId: string): string {
  return `${MERCHANT_CENTER_BASE_URL}/payments/${encodeURIComponent(paymentId)}`;
}

function paymentTransactionFacts(
  notification: PaymentTransactionInternalNotification,
  paymentUrl: string,
): Array<[string, string | undefined]> {
  const transaction = notification.type === "PaymentTransactionAdded" ? notification.transaction : undefined;
  return [
    ["Commerce Notification ID", notification.id],
    ["Commerce Notification type", notification.type],
    ["Payment ID", notification.resource.id],
    ["Payment link", paymentUrl],
    ["Payment resource version", formatValue(notification.resourceVersion)],
    ["Sequence number", formatValue(notification.sequenceNumber)],
    ["Transaction ID", transactionId(notification)],
    ["Transaction state", transactionState(notification)],
    ["Transaction type", transaction ? stringValue(transaction.type) : undefined],
    ["Transaction amount", transaction ? formatValue(transaction.amount) : undefined],
    ["Transaction interfaceId", transaction ? stringValue(transaction.interfaceId) : undefined],
    ["Transaction interactionId", transaction ? stringValue(transaction.interactionId) : undefined],
    ["Created at", stringValue(notification.createdAt)],
    ["Raw transaction", transaction ? formatValue(transaction) : undefined],
  ];
}

function transactionId(notification: PaymentTransactionInternalNotification): string | undefined {
  if (notification.type === "PaymentTransactionAdded") {
    return stringValue(notification.transaction.id);
  }
  return stringValue(notification.transactionId);
}

function transactionState(notification: PaymentTransactionInternalNotification): string {
  if (notification.type === "PaymentTransactionAdded") {
    return notification.transaction.state;
  }
  return notification.state;
}

function factsTable(facts: Array<[string, string | undefined]>): string {
  const rows = facts
    .filter(([, value]) => value !== undefined && value.length > 0)
    .map(
      ([label, value]) => `
        <tr>
          <td style="border-top: 1px solid #e6e3e0; padding: 10px 12px 10px 0; font-family: Helvetica, Arial, sans-serif; font-size: 12px; line-height: 18px; color: #7c7d81; vertical-align: top;">${escapeHtml(label)}</td>
          <td style="border-top: 1px solid #e6e3e0; padding: 10px 0; font-family: 'Courier New', Courier, monospace; font-size: 12px; line-height: 18px; color: #1a1818; word-break: break-all; vertical-align: top;">${escapeHtml(value ?? "")}</td>
        </tr>`,
    )
    .join("\n");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 8px 0 0; border-collapse: collapse;">${rows}</table>`;
}

function factsText(facts: Array<[string, string | undefined]>): string {
  return facts
    .filter(([, value]) => value !== undefined && value.length > 0)
    .map(([label, value]) => `${label}: ${value}`)
    .join("\n");
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function formatValue(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === "string") {
    return value.length > 0 ? value : undefined;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}
