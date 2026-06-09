import { describe, expect, it } from 'vitest';
import { renderOrderCreatedEmail } from './order-created';

describe('renderOrderCreatedEmail', () => {
  it('renders order confirmation copy', () => {
    const email = renderOrderCreatedEmail({
      id: 'message-id',
      order: { orderNumber: 'ORD-1' },
    });

    expect(email.subject).toBe('Order ORD-1 confirmed');
    expect(email.html).toContain('ORD-1');
    expect(email.text).toContain('ORD-1');
  });

  it('escapes order number in html', () => {
    const email = renderOrderCreatedEmail({
      id: 'message-id',
      order: { orderNumber: '<ORD>' },
    });

    expect(email.html).toContain('&lt;ORD&gt;');
  });
});
