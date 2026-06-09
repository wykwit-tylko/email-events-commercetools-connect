export type RenderedEmail = {
  subject: string;
  html: string;
  text: string;
};

export type CustomerPasswordTokenCreatedNotification = {
  notificationType: 'Message';
  id: string;
  type: 'CustomerPasswordTokenCreated';
  customerId: string;
  customerEmail: string;
  expiresAt: string;
  value: string;
};

export function renderPasswordResetEmail(
  notification: CustomerPasswordTokenCreatedNotification,
  storeUrl: string,
): RenderedEmail {
  const resetUrl = `${storeUrl}/reset-password?token=${encodeURIComponent(notification.value)}&email=${encodeURIComponent(notification.customerEmail)}`;
  const subject = 'Reset your password';

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
            .button { display: inline-block; padding: 12px 24px; background: #dc3545; color: white; text-decoration: none; border-radius: 4px; margin: 20px 0; }
            .link { color: #dc3545; word-break: break-all; }
            .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #999; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Reset your password</h1>
            <p>Hi,</p>
            <p>We received a request to reset your password. Click the button below to create a new password:</p>
            <a href="${escapeHtml(resetUrl)}" class="button">Reset Password</a>
            <p>Or copy and paste this link into your browser:</p>
            <p class="link">${escapeHtml(resetUrl)}</p>
            <p>This link will expire soon. If you didn't request a password reset, you can safely ignore this email.</p>
            <div class="footer">
              <p>This email was sent to ${escapeHtml(notification.customerEmail)}.</p>
            </div>
          </div>
        </body>
      </html>
    `,
    text: `Reset your password\n\nHi,\n\nWe received a request to reset your password. Please visit this link to create a new password:\n\n${resetUrl}\n\nThis link will expire soon. If you didn't request a password reset, you can safely ignore this email.`,
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
