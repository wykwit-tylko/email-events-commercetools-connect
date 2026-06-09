export type RenderedEmail = {
  subject: string;
  html: string;
  text: string;
};

export type CustomerEmailTokenCreatedNotification = {
  notificationType: 'Message';
  id: string;
  type: 'CustomerEmailTokenCreated';
  customerId: string;
  customerEmail: string;
  expiresAt: string;
  value: string;
};

export function renderEmailVerification(
  notification: CustomerEmailTokenCreatedNotification,
  storeUrl: string,
): RenderedEmail {
  const verificationUrl = `${storeUrl}/verify-email?token=${encodeURIComponent(notification.value)}&email=${encodeURIComponent(notification.customerEmail)}`;
  const subject = 'Verify your email address';

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
            .link { color: #007bff; word-break: break-all; }
            .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #999; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Welcome! Please verify your email</h1>
            <p>Hi,</p>
            <p>Thank you for creating an account. Please verify your email address by clicking the button below:</p>
            <a href="${escapeHtml(verificationUrl)}" class="button">Verify Email Address</a>
            <p>Or copy and paste this link into your browser:</p>
            <p class="link">${escapeHtml(verificationUrl)}</p>
            <p>This link will expire soon. If you didn't create an account, you can safely ignore this email.</p>
            <div class="footer">
              <p>This email was sent to ${escapeHtml(notification.customerEmail)}.</p>
            </div>
          </div>
        </body>
      </html>
    `,
    text: `Welcome! Please verify your email\n\nHi,\n\nThank you for creating an account. Please verify your email address by visiting this link:\n\n${verificationUrl}\n\nThis link will expire soon. If you didn't create an account, you can safely ignore this email.`,
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
