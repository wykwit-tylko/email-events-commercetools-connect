import { afterEach, describe, expect, it, vi } from 'vitest';
import { CloudflareQueuePublisher } from './cloudflare-queue-publisher';

describe('CloudflareQueuePublisher', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('publishes Commerce Notification bytes to Cloudflare Queue HTTP API', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );
    const publisher = new CloudflareQueuePublisher({
      accountId: 'account-id',
      queueId: 'queue-id',
      apiToken: 'api-token',
      timeoutMs: 1000,
    });

    await publisher.publish({ type: 'OrderCreated' }, {
      contentType: 'application/json',
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] || [];
    expect(url).toBe(
      'https://api.cloudflare.com/client/v4/accounts/account-id/queues/queue-id/messages',
    );
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      'Bearer api-token',
    );
    const body = JSON.parse(init?.body as string) as {
      content_type: string;
      body: { type: string };
    };
    expect(body.content_type).toBe('json');
    expect(body.body).toEqual({ type: 'OrderCreated' });
  });

  it('throws when Cloudflare Queue publish fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('forbidden', { status: 403 }),
    );
    const publisher = new CloudflareQueuePublisher({
      accountId: 'account-id',
      queueId: 'queue-id',
      apiToken: 'api-token',
      timeoutMs: 1000,
    });

    await expect(publisher.publish({ type: 'OrderCreated' })).rejects.toThrow(
      'Cloudflare Queue publish failed with 403',
    );
  });
});
