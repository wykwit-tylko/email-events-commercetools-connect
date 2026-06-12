import { describe, expect, it } from 'vitest';
import { renderEmailVerification } from './template';

describe('renderEmailVerification', () => {
  it('renders the confirmation code for the registration screen', () => {
    const email = renderEmailVerification({
      notificationType: 'Message',
      id: 'msg-id',
      type: 'CustomerEmailTokenCreated',
      customerId: 'cust-id',
      customerEmail: 'user@example.com',
      expiresAt: '2026-06-10T12:00:00.000Z',
      value: 'verify-token-123',
    }, 'https://shelfmarket.tylko.dev');

    expect(email.subject).toBe('Your ShelfMarket confirmation code');
    expect(email.html).toContain('verify-token-123');
    expect(email.text).toContain('verify-token-123');
    expect(email.html).toContain('login?verify_token=verify-token-123');
    expect(email.text).toContain('login?verify_token=verify-token-123');
    expect(email.html).toContain('Confirm your email');
    expect(email.html).toContain('This email was sent to user@example.com.');
  });

  it('escapes HTML in token and email', () => {
    const email = renderEmailVerification({
      notificationType: 'Message',
      id: 'msg-id',
      type: 'CustomerEmailTokenCreated',
      customerId: 'cust-id',
      customerEmail: 'user+test<script>@example.com',
      expiresAt: '2026-06-10T12:00:00.000Z',
      value: '<token>',
    }, 'https://shelfmarket.tylko.dev');

    expect(email.html).not.toContain('<token>');
    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('user+test&lt;script&gt;@example.com');
  });
});
