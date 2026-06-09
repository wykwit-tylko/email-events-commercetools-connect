import { describe, expect, it } from 'vitest';
import { renderEmailVerification } from './template';

describe('renderEmailVerification', () => {
  it('renders verification email with correct link', () => {
    const email = renderEmailVerification({
      notificationType: 'Message',
      id: 'msg-id',
      type: 'CustomerEmailTokenCreated',
      customerId: 'cust-id',
      customerEmail: 'user@example.com',
      expiresAt: '2026-06-10T12:00:00.000Z',
      value: 'verify-token-123',
    }, 'https://shelfmarket.tylko.dev');

    expect(email.subject).toBe('Verify your email address');
    expect(email.html).toContain('verify-email?token=verify-token-123');
    expect(email.html).toContain('email=user%40example.com');
    expect(email.text).toContain('verify-email?token=verify-token-123');
    expect(email.html).toContain('Welcome! Please verify your email');
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
