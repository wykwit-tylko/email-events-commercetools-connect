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
    id: string;
    customerEmail: string;
    orderNumber?: string;
  };
};

export function renderOrderCreatedEmail(
  notification: OrderCreatedNotification,
  storeUrl: string,
): RenderedEmail {
  const orderNumber = notification.order.orderNumber || notification.order.id;
  const subject = `Order ${orderNumber} confirmed`;
  const orderDetailsUrl = `${storeUrl}/orders/${encodeURIComponent(notification.order.id)}`;

  return {
    subject,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
            .container { max-width: 600px; margin: 0 auto; background: white; padding: 40px; border-radius: 8px; }
            h1 { color: #333; font-size: 24px; }
            p { color: #666; line-height: 1.6; }
            .button { display: inline-block; padding: 12px 24px; background: #007bff; color: white; text-decoration: none; border-radius: 4px; margin: 20px 0; }
            .order-number { font-weight: bold; color: #333; }
            .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #999; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Thank you for your order</h1>
            <p>Hi,</p>
            <p>We have received your order <span class="order-number">${escapeHtml(orderNumber)}</span>.</p>
            <p>You can view your order details and track its status by clicking the button below:</p>
            <a href="${escapeHtml(orderDetailsUrl)}" class="button">View Order Details</a>
            <p>Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all;">${escapeHtml(orderDetailsUrl)}</p>
            <p>We will send you another email when your order is ready for delivery.</p>
            <div class="footer">
              <p>This email was sent to ${escapeHtml(notification.order.customerEmail)}.</p>
            </div>
          </div>
        </body>
      </html>
    `,
    text: `Thank you for your order\n\nHi,\n\nWe have received your order ${orderNumber}.\n\nView your order details:\n${orderDetailsUrl}\n\nWe will send you another email when your order is ready for delivery.`,
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
