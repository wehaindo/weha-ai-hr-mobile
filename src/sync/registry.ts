// Inbound appliers: device apps register how each entity type lands in the
// local database; the sync engine stays entity-agnostic.

import type { DeviceBridge } from '@/platform';

export type InboundApplier = (bridge: DeviceBridge, items: Record<string, unknown>[]) => Promise<void>;

const appliers = new Map<string, InboundApplier>();

export function registerApplier(entityType: string, applier: InboundApplier): void {
  appliers.set(entityType, applier);
}

export function getApplier(entityType: string): InboundApplier | undefined {
  return appliers.get(entityType);
}
