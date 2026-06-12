import {
  codeBox,
  ctaButton,
  linkFallback,
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

  const verifyUrl = `${storeUrl}/login?verify_token=${encodeURIComponent(notification.value)}`;

  const bodyHtml = [
    paragraph('Hi,'),
    paragraph(
      'Thanks for creating a ShelfMarket account. Confirm your email address using the button below, or copy the code into the registration screen:',
    ),
    codeBox(notification.value),
    ctaButton('Confirm email', verifyUrl),
    linkFallback(verifyUrl),
    paragraph(
      "The code expires in 30 minutes and only the most recent code works. If you didn't create an account, you can safely ignore this email.",
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
    text: `Confirm your email\n\nHi,\n\nThanks for creating a ShelfMarket account. Confirm your email address by opening the link below, or enter this code on the registration screen:\n\n${notification.value}\n\n${verifyUrl}\n\nThe code expires in 30 minutes and only the most recent code works. If you didn't create an account, you can safely ignore this email.`,
  };
}
