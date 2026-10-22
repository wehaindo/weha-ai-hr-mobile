// @vitest-environment node
// Integration test: SyncEngine against a real in-process HTTP server that
// mimics the WEHA ERP device API, over a real sql.js database.
import { createServer, type Server } from 'http';
import { AddressInfo } from 'net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createFakeBridge, type FakeBridgeHandle } from '../helpers/fake-bridge';
import { SyncEngine } from '@/sync/engine';
import { enqueueSync, getPendingItems } from '@/sync/outbox';
import { registerApplier } from '@/sync/registry';
import { useSyncStore } from '@/sync/sync-store';

interface CapturedRequest {
  method: string;
  path: string;
  body: Record<string, unknown> | null;
}

let server: Server;
let baseUrl: string;
let captured: CapturedRequest[] = [];
let failNext = false;

function startServer(): Promise<void> {
  return new Promise((resolve) => {
    server = createServer((req, res) => {
      let raw = '';
      req.on('data', (chunk) => (raw += chunk));
      req.on('end', () => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        const body = raw ? JSON.parse(raw) : null;
        captured.push({ method: req.method ?? '', path: url.pathname + url.search, body });

        if (failNext) {
          failNext = false;
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { message: 'boom' } }));
          return;
        }

        if (url.pathname === '/api/device/activate') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              credentials: { deviceToken: 'tok_123', tenantId: 'tenant-a', scopes: [] },
              device: { deviceCode: 'DEV-001' },
            })
          );
          return;
        }

        if (url.pathname === '/api/device/PRODUCT') {
          if (req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                success: true,
                data: { items: [{ id: 'srv-1', name: 'Remote item' }], total: 1, limit: 50, offset: 0 },
              })
            );
            return;
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, data: { ok: true } }));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
}

describe('SyncEngine', () => {
  let handle: FakeBridgeHandle;
  let engine: SyncEngine;

  beforeAll(async () => {
    await startServer();
  });

  afterAll(() => {
    server.close();
  });

  beforeEach(async () => {
    captured = [];
    failNext = false;
    useSyncStore.setState({
      activated: false,
      deviceCode: null,
      tenantSlug: null,
      lastError: null,
      lastRunAt: null,
      running: false,
      erpReachable: null,
    });
    handle = await createFakeBridge();
    engine = new SyncEngine(handle.bridge, { baseUrl, pollIntervalMs: 100000 });
    await engine.load();
  });

  it('creates the erp integration row on load', async () => {
    const rows = await handle.bridge.db.query<{ id: string; status: string }>('SELECT id, status FROM integrations');
    expect(rows).toEqual([{ id: 'erp', status: 'inactive' }]);
    expect(useSyncStore.getState().activated).toBe(false);
  });

  it('activates with a token and persists it', async () => {
    await engine.activate('activation-token');

    expect(useSyncStore.getState().activated).toBe(true);
    expect(useSyncStore.getState().deviceCode).toBe('DEV-001');

    const rows = await handle.bridge.db.query<{ device_token: string; status: string }>(
      'SELECT device_token, status FROM integrations WHERE id = ?',
      ['erp']
    );
    expect(rows[0]).toEqual({ device_token: 'tok_123', status: 'active' });

    const activateCall = captured.find((c) => c.path === '/api/device/activate');
    expect(activateCall?.body).toEqual({ token: 'activation-token' });
  });

  it('drains the outbox on runNow and marks items done', async () => {
    await engine.activate('activation-token');
    await engine.registerDefinition({ entityType: 'product', direction: 'outbound', configCode: 'PRODUCT' });

    await enqueueSync(handle.bridge, {
      entityType: 'product',
      entityId: 'p1',
      action: 'create',
      payload: { id: 'p1', name: 'Local product' },
    });

    await engine.runNow();

    const pushCall = captured.find((c) => c.method === 'POST' && c.path.startsWith('/api/device/PRODUCT'));
    expect(pushCall).toBeTruthy();
    expect(pushCall?.body).toMatchObject({ id: 'p1', name: 'Local product' });
    expect(pushCall?.path).toContain('tenantId=tenant-a');

    expect(await getPendingItems(handle.bridge)).toHaveLength(0);
    const stats = useSyncStore.getState().stats;
    expect(stats.done).toBe(1);
    expect(useSyncStore.getState().erpReachable).toBe(true);
  });

  it('marks failed pushes and logs them', async () => {
    await engine.activate('activation-token');
    await engine.registerDefinition({ entityType: 'product', direction: 'outbound', configCode: 'PRODUCT' });
    await enqueueSync(handle.bridge, { entityType: 'product', entityId: 'p1', action: 'create', payload: {} });

    failNext = true;
    await engine.runNow();

    const pending = await getPendingItems(handle.bridge);
    expect(pending).toHaveLength(1);
    expect(pending[0].retry_count).toBe(1);
    expect(pending[0].last_error).toBe('boom');

    const log = await handle.bridge.db.query<{ status: string; direction: string }>(
      "SELECT status, direction FROM sync_log WHERE status = 'error'"
    );
    expect(log).toHaveLength(1);
  });

  it('skips outbox items without an outbound definition', async () => {
    await engine.activate('activation-token');
    await enqueueSync(handle.bridge, { entityType: 'mystery', entityId: 'x', action: 'create' });

    await engine.runNow();

    const pending = await getPendingItems(handle.bridge);
    expect(pending).toHaveLength(1);
    expect(pending[0].last_error).toContain('No outbound sync definition');
  });

  it('pulls inbound definitions and applies them via the registry', async () => {
    await engine.activate('activation-token');
    await engine.registerDefinition({ entityType: 'product', direction: 'inbound', configCode: 'PRODUCT' });

    const applied: Record<string, unknown>[][] = [];
    registerApplier('product', async (_bridge, items) => {
      applied.push(items);
    });

    await engine.runNow();

    expect(applied).toHaveLength(1);
    expect(applied[0][0]).toMatchObject({ id: 'srv-1', name: 'Remote item' });

    const defs = await handle.bridge.db.query<{ last_synced_at: string | null }>(
      "SELECT last_synced_at FROM sync_definitions WHERE direction = 'inbound'"
    );
    expect(defs[0].last_synced_at).toBeTruthy();
  });

  it('sends a heartbeat after a run', async () => {
    await engine.activate('activation-token');
    await engine.runNow();
    const heartbeat = captured.find((c) => c.path === '/api/device/v1/ai-box/heartbeat');
    expect(heartbeat?.body).toMatchObject({ deviceCode: 'DEV-001' });
  });

  it('testConnection reports reachability', async () => {
    await engine.activate('activation-token');
    const result = await engine.testConnection();
    expect(result.success).toBe(true);
    expect(useSyncStore.getState().erpReachable).toBe(true);
  });

  it('does not tick when not activated', async () => {
    await enqueueSync(handle.bridge, { entityType: 'product', entityId: 'p1', action: 'create' });
    await engine.runNow();
    expect(captured.filter((c) => c.path.startsWith('/api/device/PRODUCT'))).toHaveLength(0);
    expect(await getPendingItems(handle.bridge)).toHaveLength(1);
  });
});
