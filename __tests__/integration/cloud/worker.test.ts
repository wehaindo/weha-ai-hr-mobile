// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { createFakeBridge, type FakeBridgeHandle } from '../../helpers/fake-bridge';
import { registerOrderlineSource, clearOrderlineSources, type OrderlineRow } from '@/integration/orderline-source';
import { enqueueOrderlineJobs } from '@/integration/cloud/enqueue';
import { getSupabaseSyncWorker, resetSupabaseSyncWorker } from '@/integration/cloud/supabase/worker';
import { SupabaseConfigService } from '@/integration/cloud/supabase/config';
import { getGristSyncWorker, resetGristSyncWorker } from '@/integration/cloud/grist/worker';
import { GristConfigService } from '@/integration/cloud/grist/config';

// A controllable cloud.request: record calls, return scripted responses.
function makeCloudBridge(handle: FakeBridgeHandle, respond: (url: string) => { ok: boolean; status: number; body?: string; json?: unknown }) {
  const calls: Array<{ url: string; method?: string; body?: string }> = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (handle.bridge as any).cloud.request = async (req: { url: string; method?: string; body?: string }) => {
    calls.push({ url: req.url, method: req.method, body: req.body });
    const r = respond(req.url);
    return { ok: r.ok, status: r.status, headers: {}, body: r.body ?? '', json: r.json };
  };
  return { calls };
}

function seedOrderlineRows(): OrderlineRow[] {
  return [
    { id: '1', order_id: '42', order_number: 'ORD-42', product_name: 'Widget', quantity: 2, unit_price: 500 },
    { id: '2', order_id: '42', order_number: 'ORD-42', product_name: 'Gadget', quantity: 1, unit_price: 1000 },
  ];
}

describe('orderline source registry', () => {
  let handle: FakeBridgeHandle;

  beforeEach(async () => {
    handle = await createFakeBridge();
    clearOrderlineSources();
  });

  it('registers + resolves a source; falls back to the first registered', async () => {
    registerOrderlineSource({ type: 'transactions', fetchUnsynced: async () => seedOrderlineRows() });

    // Enqueue for Supabase with an active config.
    const service = new SupabaseConfigService(handle.bridge);
    await service.saveConfig({ name: 'sb', supabase_url: 'https://x.supabase.co', access_token: 'token', sync_mode: 'scheduled' });

    const result = await enqueueOrderlineJobs(handle.bridge, 'supabase');
    expect(result.enqueued).toBe(2);
    expect(result.error).toBeUndefined();

    const jobs = await handle.bridge.db.query<{ status: string }>('SELECT status FROM supabase_sync_jobs');
    expect(jobs).toHaveLength(2);
    expect(jobs.every((j) => j.status === 'pending')).toBe(true);
  });

  it('is idempotent on sync_id (re-enqueue skips duplicates)', async () => {
    registerOrderlineSource({ type: 'transactions', fetchUnsynced: async () => seedOrderlineRows() });
    const service = new SupabaseConfigService(handle.bridge);
    await service.saveConfig({ name: 'sb', supabase_url: 'https://x.supabase.co', access_token: 'token' });

    await enqueueOrderlineJobs(handle.bridge, 'supabase');
    const second = await enqueueOrderlineJobs(handle.bridge, 'supabase');
    expect(second.enqueued).toBe(0);
    expect(second.skipped).toBe(2);

    const jobs = await handle.bridge.db.query('SELECT id FROM supabase_sync_jobs');
    expect(jobs).toHaveLength(2);
  });

  it('reports an error when no config exists', async () => {
    registerOrderlineSource({ type: 'transactions', fetchUnsynced: async () => [] });
    const result = await enqueueOrderlineJobs(handle.bridge, 'grist');
    expect(result.error).toBe('No active config');
  });

  it('reports an error when no source is registered', async () => {
    const service = new GristConfigService(handle.bridge);
    await service.saveConfig({ name: 'g', grist_url: 'https://grist', api_token: 'tok', doc_id: 'doc' });
    const result = await enqueueOrderlineJobs(handle.bridge, 'grist');
    expect(result.error).toBe('No orderline source registered');
  });
});

describe('Supabase sync worker', () => {
  let handle: FakeBridgeHandle;

  beforeEach(async () => {
    handle = await createFakeBridge();
    clearOrderlineSources();
    resetSupabaseSyncWorker();
    resetGristSyncWorker();
    registerOrderlineSource({ type: 'transactions', fetchUnsynced: async () => seedOrderlineRows() });
  });

  it('sends pending jobs via PostgREST upsert and marks them success', async () => {
    const service = new SupabaseConfigService(handle.bridge);
    await service.saveConfig({ name: 'sb', supabase_url: 'https://x.supabase.co', access_token: 'token', sync_mode: 'scheduled' });
    await enqueueOrderlineJobs(handle.bridge, 'supabase');

    const { calls } = makeCloudBridge(handle, (url) => {
      if (url.includes('/rest/v1/pos_orderlines')) return { ok: true, status: 200, json: [] };
      return { ok: true, status: 200, json: {} };
    });

    const worker = getSupabaseSyncWorker(handle.bridge);
    worker.start();
    await new Promise((r) => setTimeout(r, 250));
    worker.stop();

    // At least one upsert call to the pos_orderlines table.
    expect(calls.some((c) => c.url.includes('/rest/v1/pos_orderlines') && c.method === 'POST')).toBe(true);

    const jobs = await handle.bridge.db.query<{ status: string }>('SELECT status FROM supabase_sync_jobs');
    expect(jobs.every((j) => j.status === 'success')).toBe(true);
  });

  it('marks jobs failed when validation fails (missing required fields)', async () => {
    // Register a source that yields an invalid (empty) row.
    clearOrderlineSources();
    registerOrderlineSource({ type: 'transactions', fetchUnsynced: async () => [{ id: 'bad' }] });

    const service = new SupabaseConfigService(handle.bridge);
    await service.saveConfig({ name: 'sb', supabase_url: 'https://x.supabase.co', access_token: 'token', sync_mode: 'scheduled', max_retries: 1 });
    await enqueueOrderlineJobs(handle.bridge, 'supabase');

    const worker = getSupabaseSyncWorker(handle.bridge);
    worker.start();
    await new Promise((r) => setTimeout(r, 250));
    worker.stop();

    const jobs = await handle.bridge.db.query<{ status: string; last_error: string | null }>('SELECT status, last_error FROM supabase_sync_jobs');
    expect(jobs[0].status).toBe('failed');
    expect(jobs[0].last_error).toContain('VALIDATION_ERROR');
  });
});

describe('Grist sync worker', () => {
  let handle: FakeBridgeHandle;

  beforeEach(async () => {
    handle = await createFakeBridge();
    clearOrderlineSources();
    resetSupabaseSyncWorker();
    resetGristSyncWorker();
    registerOrderlineSource({ type: 'transactions', fetchUnsynced: async () => seedOrderlineRows() });
  });

  it('appends records to the Grist table and marks jobs success', async () => {
    const service = new GristConfigService(handle.bridge);
    await service.saveConfig({ name: 'g', grist_url: 'https://grist.example.com', api_token: 'tok', doc_id: 'doc1', table_id: 'OrderLines', sync_mode: 'scheduled' });
    await enqueueOrderlineJobs(handle.bridge, 'grist');

    const { calls } = makeCloudBridge(handle, () => ({ ok: true, status: 200, json: { records: [{ id: 1 }, { id: 2 }] } }));

    const worker = getGristSyncWorker(handle.bridge);
    worker.start();
    await new Promise((r) => setTimeout(r, 250));
    worker.stop();

    expect(calls.some((c) => c.url.includes('/tables/OrderLines/records') && c.method === 'POST')).toBe(true);
    const jobs = await handle.bridge.db.query<{ status: string }>('SELECT status FROM grist_sync_jobs');
    expect(jobs.every((j) => j.status === 'success')).toBe(true);
  });
});
