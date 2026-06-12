import {
  codeBox,
  paragraph,
  renderShelfMarketHtml,
  type RenderedEmail,
} from '../../templates/layout';

export type { RenderedEmail };

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
  const subject = 'Your ShelfMarket confirmation code';

  const bodyHtml = [
    paragraph('Hi,'),
    paragraph(
      'Thanks for creating a ShelfMarket account. Copy this confirmation code into the registration screen to confirm your email address:',
    ),
    codeBox(notification.value),
    paragraph(
      "The code expires in 24 hours and only the most recent code works. If you didn't create an account, you can safely ignore this email.",
    ),
  ].join('\n');

  return {
    subject,
    html: renderShelfMarketHtml(
      {
        eyebrow: 'Account',
        title: 'Confirm your email.',
        bodyHtml,
        footerNote: `This email was sent to ${notification.customerEmail}.`,
      },
      storeUrl,
    ),
    text: `Confirm your email\n\nHi,\n\nThanks for creating a ShelfMarket account. Enter this confirmation code on the registration screen to confirm your email address:\n\n${notification.value}\n\nThe code expires in 24 hours and only the most recent code works. If you didn't create an account, you can safely ignore this email.`,
  };
}
