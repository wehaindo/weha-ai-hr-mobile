'use client';

import { useEffect } from 'react';
import { useBridge, type DeviceBridge } from '@/platform';
import deviceConfig from '@/device.config';
import { SyncEngine } from './engine';
import { registerIntegrationEntity } from '@/integration/entities';
import { seedProductIntegration, seedIdentityIntegrations } from '@/integration/seed';

let engine: SyncEngine | null = null;

export function getSyncEngine(bridge: DeviceBridge, config = deviceConfig.erp): SyncEngine {
  if (!engine) engine = new SyncEngine(bridge, config);
  return engine;
}

/** Mounts the background sync loop (poll + outbox drain). */
export function useSyncWorker(): void {
  const bridge = useBridge();

  useEffect(() => {
    if (!deviceConfig.modules.sync) return;
    // Register the product entity with its natural key so pulls upsert by code
    // instead of inserting duplicates. The Testing module registers it too, but
    // is disabled on the web/minimal profile.
    registerIntegrationEntity({
      type: 'test_products',
      table: 'test_products',
      keys: ['code'],
      deltaColumn: 'updated_at',
    });
    // Device-sync identity (EMPLOYEES / PORTAL_USERS) — upsert by the source id,
    // which is always present (unlike employeeId / email).
    registerIntegrationEntity({ type: 'employees', table: 'employees', keys: ['id'] });
    registerIntegrationEntity({ type: 'portal_users', table: 'portal_users', keys: ['id'] });
    const syncEngine = getSyncEngine(bridge);
    let cancelled = false;
    // Seed the example + identity integrations (idempotent) before the first sync.
    seedProductIntegration(bridge)
      .then(() => seedIdentityIntegrations(bridge))
      .catch(() => undefined)
      .then(() => (cancelled ? undefined : syncEngine.load()))
      .then(() => {
        if (!cancelled) syncEngine.start();
      })
      .catch((err: unknown) => {
        console.error('[sync] failed to load engine:', err);
      });
    return () => {
      cancelled = true;
      syncEngine.stop();
    };
  }, [bridge]);
}
