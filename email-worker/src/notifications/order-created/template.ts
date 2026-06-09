export type RenderedEmail = {
  subject: string;
  html: string;
  text: string;
};

export type OrderCreatedNotification = {
  notificationType: 'Message';
  id: string;
  type: 'OrderCreated';
  order: {
    id?: string;
    customerEmail: string;
    orderNumber?: string;
  };
};

export function renderOrderCreatedEmail(
  notification: OrderCreatedNotification,
): RenderedEmail {
  const orderNumber = notification.order.orderNumber || notification.order.id || 'your order';
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
