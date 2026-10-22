// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createFakeBridge } from '../helpers/fake-bridge';
import { clearCompleted, enqueueSync, getOutboxStats, getPendingItems, markOutboxStatus } from '@/sync/outbox';

describe('sync outbox', () => {
  it('enqueues mutations and counts them by status', async () => {
    const { bridge } = await createFakeBridge();

    await enqueueSync(bridge, { entityType: 'product', entityId: 'p1', action: 'create', payload: { name: 'A' } });
    await enqueueSync(bridge, { entityType: 'product', entityId: 'p2', action: 'update', payload: { name: 'B' } });

    const stats = await getOutboxStats(bridge);
    expect(stats.pending).toBe(2);
    expect(stats.total).toBe(2);

    const items = await getPendingItems(bridge);
    expect(items).toHaveLength(2);
    expect(items[0].entity_id).toBe('p1');
    expect(JSON.parse(items[0].payload!)).toEqual({ name: 'A' });
  });

  it('marks items done or failed with retry counting', async () => {
    const { bridge } = await createFakeBridge();
    await enqueueSync(bridge, { entityType: 'product', entityId: 'p1', action: 'create' });
    const [item] = await getPendingItems(bridge);

    await markOutboxStatus(bridge, item.id, 'processing');
    expect((await getPendingItems(bridge))).toHaveLength(0);

    await markOutboxStatus(bridge, item.id, 'failed', 'network down');
    const failed = await getPendingItems(bridge);
    expect(failed).toHaveLength(1);
    expect(failed[0].retry_count).toBe(1);
    expect(failed[0].last_error).toBe('network down');

    await markOutboxStatus(bridge, item.id, 'done');
    const stats = await getOutboxStats(bridge);
    expect(stats.done).toBe(1);
    expect(stats.failed).toBe(0);
  });

  it('clears completed items only', async () => {
    const { bridge } = await createFakeBridge();
    await enqueueSync(bridge, { entityType: 'product', entityId: 'p1', action: 'create' });
    await enqueueSync(bridge, { entityType: 'product', entityId: 'p2', action: 'create' });
    const [first, second] = await getPendingItems(bridge);

    await markOutboxStatus(bridge, first.id, 'done');
    await markOutboxStatus(bridge, second.id, 'failed', 'err');

    await clearCompleted(bridge);
    const stats = await getOutboxStats(bridge);
    expect(stats.done).toBe(0);
    expect(stats.failed).toBe(1);
  });

  it('excludes items that exceeded the retry limit', async () => {
    const { bridge } = await createFakeBridge();
    await enqueueSync(bridge, { entityType: 'product', entityId: 'p1', action: 'create' });
    const [item] = await getPendingItems(bridge);

    for (let i = 0; i < 6; i++) {
      await markOutboxStatus(bridge, item.id, 'failed', 'always fails');
    }
    expect(await getPendingItems(bridge)).toHaveLength(0);
  });
});
