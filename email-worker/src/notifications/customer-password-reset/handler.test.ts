import { describe, expect, it } from 'vitest';
import {
  isCustomerPasswordTokenCreatedNotification,
} from './handler';

describe('isCustomerPasswordTokenCreatedNotification', () => {
  it('recognizes valid password reset notifications', () => {
    const notification = {
      notificationType: 'Message',
      id: 'message-id',
      type: 'CustomerPasswordTokenCreated',
      customerId: 'customer-id',
      customerEmail: 'user@example.com',
      expiresAt: '2026-06-10T12:00:00.000Z',
      value: 'token-456',
    };

    expect(isCustomerPasswordTokenCreatedNotification(notification)).toBe(true);
  });

  it('rejects missing value', () => {
    expect(
      isCustomerPasswordTokenCreatedNotification({
        notificationType: 'Message',
        id: 'message-id',
        type: 'CustomerPasswordTokenCreated',
        customerId: 'customer-id',
        customerEmail: 'user@example.com',
      }),
    ).toBe(false);
  });

  it('rejects missing customerEmail', () => {
    expect(
      isCustomerPasswordTokenCreatedNotification({
        notificationType: 'Message',
        id: 'message-id',
        type: 'CustomerPasswordTokenCreated',
        customerId: 'customer-id',
    value: 'token-456',
      }),
    ).toBe(false);
  });
});
