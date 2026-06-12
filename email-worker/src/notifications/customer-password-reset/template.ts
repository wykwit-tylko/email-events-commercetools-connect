import {
  ctaButton,
  linkFallback,
  normalizeStoreUrl,
  paragraph,
  renderShelfMarketHtml,
  type RenderedEmail,
} from '../../templates/layout';

export type { RenderedEmail };

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
  // The storefront login page picks the token up from this query parameter
  // and shows the "choose a new password" step.
  const resetUrl = `${normalizeStoreUrl(storeUrl)}/login?reset_token=${encodeURIComponent(notification.value)}`;
  const subject = 'Reset your ShelfMarket password';

  const bodyHtml = [
    paragraph('Hi,'),
    paragraph(
      'We received a request to reset the password for your ShelfMarket account. Choose a new password using the button below:',
    ),
    ctaButton('Reset password', resetUrl),
    linkFallback(resetUrl),
    paragraph(
      "The link stays valid for 30 minutes and only the most recent link works. If you didn't request a password reset, you can safely ignore this email.",
    ),
  ].join('\n');

  return {
    subject,
    html: renderShelfMarketHtml(
      {
        eyebrow: 'Account',
        title: 'Reset your password.',
        bodyHtml,
        footerNote: `This email was sent to ${notification.customerEmail}.`,
      },
      storeUrl,
    ),
    text: `Reset your password\n\nHi,\n\nWe received a request to reset the password for your ShelfMarket account. Open this link to choose a new password:\n\n${resetUrl}\n\nThe link stays valid for 30 minutes and only the most recent link works. If you didn't request a password reset, you can safely ignore this email.`,
  };
}
