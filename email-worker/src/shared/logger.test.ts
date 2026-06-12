import { afterEach, describe, expect, it, vi } from 'vitest';
import { logger } from './logger';

describe('logger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('redacts secret-like fields', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    logger.info('test', {
      tokenValue: 'verify-token-123',
      ORDER_LINK_SECRET: 'hunter2',
      resetPassword: 'plain',
    });

    expect(JSON.parse(log.mock.calls[0]?.[0] as string)).toMatchObject({
      tokenValue: '[redacted]',
      ORDER_LINK_SECRET: '[redacted]',
      resetPassword: '[redacted]',
    });
  });

  it('masks email addresses in email-like fields', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    logger.info('test', {
      to: 'user@example.com',
      customerEmail: 'newuser@example.com',
      subject: 'Order ORD-1 confirmed',
    });

    expect(JSON.parse(log.mock.calls[0]?.[0] as string)).toMatchObject({
      to: 'u***@example.com',
      customerEmail: 'n***@example.com',
      subject: 'Order ORD-1 confirmed',
    });
  });

  it('leaves non-string email fields and other fields untouched', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    logger.error('test', {
      to: undefined,
      notificationId: 'message-id',
      errorMessage: 'send failed',
    });

    expect(JSON.parse(error.mock.calls[0]?.[0] as string)).toMatchObject({
      notificationId: 'message-id',
      errorMessage: 'send failed',
    });
  });
});
