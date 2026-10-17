'use client';

import { create } from 'zustand';
import type { OutboxStats } from './outbox';

export interface SyncState {
  activated: boolean;
  deviceCode: string | null;
  tenantSlug: string | null;
  lastError: string | null;
  lastRunAt: string | null;
  running: boolean;
  erpReachable: boolean | null;
  stats: OutboxStats;
  set: (partial: Partial<SyncState>) => void;
}

export const useSyncStore = create<SyncState>((set) => ({
  activated: false,
  deviceCode: null,
  tenantSlug: null,
  lastError: null,
  lastRunAt: null,
  running: false,
  erpReachable: null,
  stats: { pending: 0, processing: 0, failed: 0, done: 0, total: 0 },
  set: (partial) => set(partial),
}));
