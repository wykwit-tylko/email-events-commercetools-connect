import {
  ctaButton,
  escapeHtml,
  linkFallback,
  normalizeStoreUrl,
  paragraph,
  renderShelfMarketHtml,
  type RenderedEmail,
} from "../../templates/layout";

export type { RenderedEmail };

export type OrderCreatedNotification = {
  notificationType: "Message";
  id: string;
  type: "OrderCreated";
  order: {
    id: string;
    customerEmail: string;
    orderNumber?: string;
  };
};

export function renderOrderCreatedEmail(
  notification: OrderCreatedNotification,
  storeUrl: string,
  /** Guest access key; lets the recipient view the order without logging in. */
  orderAccessKey?: string,
): RenderedEmail {
  const orderNumber = notification.order.orderNumber || notification.order.id;
  const subject = `Order ${orderNumber} confirmed`;
  const keySuffix = orderAccessKey ? `?key=${encodeURIComponent(orderAccessKey)}` : "";
  const orderDetailsUrl = `${normalizeStoreUrl(storeUrl)}/orders/${encodeURIComponent(notification.order.id)}${keySuffix}`;

  const bodyHtml = [
    paragraph("Hi,"),
    paragraph(
      `We have received your order <strong style="color: #1a1818;">${escapeHtml(orderNumber)}</strong>. You can view its details and track its status below:`,
    ),
    ctaButton("View order details", orderDetailsUrl),
    linkFallback(orderDetailsUrl),
    paragraph("We will send you another email when your order is ready for delivery."),
  ].join("\n");

  return {
    subject,
    html: renderShelfMarketHtml(
      {
        eyebrow: "Orders",
        title: "Thank you for your order.",
        bodyHtml,
        footerNote: `This email was sent to ${notification.order.customerEmail}.`,
      },
      storeUrl,
    ),
    text: `Thank you for your order\n\nHi,\n\nWe have received your order ${orderNumber}.\n\nView your order details:\n${orderDetailsUrl}\n\nWe will send you another email when your order is ready for delivery.`,
  };
}
