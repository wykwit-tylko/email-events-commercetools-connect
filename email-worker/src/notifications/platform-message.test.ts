import { describe, expect, it } from 'vitest';
import { isOrderCreatedNotification } from './platform-message';

describe('platform-message', () => {
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
});
