import type { PlatformCommerceNotification } from '../notifications/platform-message';

export type RenderedEmail = {
  subject: string;
  html: string;
  text: string;
};

export function renderOrderCreatedEmail(
  notification: PlatformCommerceNotification,
): RenderedEmail {
  const orderNumber = notification.order?.orderNumber || notification.id || 'your order';
  const subject = `Order ${orderNumber} confirmed`;

  return {
    subject,
    html: `<h1>Thanks for your order</h1><p>We received order ${escapeHtml(orderNumber)}.</p>`,
    text: `Thanks for your order. We received order ${orderNumber}.`,
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
