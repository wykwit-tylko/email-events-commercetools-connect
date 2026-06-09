import { describe, expect, it } from 'vitest';
import { isOrderCreatedNotification } from './handler';

describe('isOrderCreatedNotification', () => {
  it('recognizes OrderCreated Platform Commerce Notifications', () => {
    const notification = {
      notificationType: 'Message',
      id: 'message-id',
      type: 'OrderCreated',
      order: { customerEmail: 'customer@example.com' },
    };

    expect(isOrderCreatedNotification(notification)).toBe(true);
  });

  it('rejects unsupported notifications as email triggers', () => {
    expect(
      isOrderCreatedNotification({
        notificationType: 'Message',
        type: 'CustomerCreated',
      }),
    ).toBe(false);
  });

  it('rejects OrderCreated notifications without a customer email', () => {
    expect(
      isOrderCreatedNotification({
        notificationType: 'Message',
        id: 'message-id',
        type: 'OrderCreated',
        order: {},
      }),
    ).toBe(false);
  });
});
