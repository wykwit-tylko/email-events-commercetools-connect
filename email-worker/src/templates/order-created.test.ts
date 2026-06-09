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

  it('falls back to order id when orderNumber is missing', () => {
    const email = renderOrderCreatedEmail({
      id: 'message-id',
      order: { id: '082ad4d9-bd3e-4244-86be-23b518d2ffb6' },
    });

    expect(email.subject).toBe('Order 082ad4d9-bd3e-4244-86be-23b518d2ffb6 confirmed');
    expect(email.html).toContain('082ad4d9-bd3e-4244-86be-23b518d2ffb6');
    expect(email.text).toContain('082ad4d9-bd3e-4244-86be-23b518d2ffb6');
  });
});
