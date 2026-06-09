import { describe, expect, it } from 'vitest';
import { renderPasswordResetEmail } from './template';

describe('renderPasswordResetEmail', () => {
  it('renders password reset email with correct link', () => {
    const email = renderPasswordResetEmail({
      notificationType: 'Message',
      id: 'msg-id',
      type: 'CustomerPasswordTokenCreated',
      customerId: 'cust-id',
      customerEmail: 'user@example.com',
      expiresAt: '2026-06-10T12:00:00.000Z',
      value: 'reset-token-456',
    }, 'https://shelfmarket.tylko.dev');

    expect(email.subject).toBe('Reset your password');
    expect(email.html).toContain('reset-password?token=reset-token-456');
    expect(email.html).toContain('email=user%40example.com');
    expect(email.text).toContain('reset-password?token=reset-token-456');
    expect(email.html).toContain('Reset your password');
  });

  it('escapes HTML in token and email', () => {
    const email = renderPasswordResetEmail({
      notificationType: 'Message',
      id: 'msg-id',
      type: 'CustomerPasswordTokenCreated',
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
