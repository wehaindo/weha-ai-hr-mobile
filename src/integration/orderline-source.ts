// Orderline source registry — the generic seam where a device app supplies the
// order-line rows that cloud destinations (Google/Supabase/Grist) push. The
// framework ships no POS tables; a device app registers a source that reads its
// own rows. Cloud workers consume the registered source. This replaces ai-pos's
// coupling to its `transactions:create` handler.

import type { DeviceBridge } from '@/platform';

/** A single order-line row ready to be mapped + pushed to a cloud destination. */
export interface OrderlineRow {
  /** Stable unique id for this line (used as the idempotent sync_id). */
  id: string;
  /** Parent order/transaction id. */
  order_id?: string;
  /** Raw field values keyed by the POS field name (mapped via column maps). */
  [field: string]: unknown;
}

export interface OrderlineSource {
  /** Source type key (e.g. 'transactions'). A device app may register one. */
  type: string;
  /**
   * Return order lines not yet synced (or since a cursor). Implementations
   * should be idempotent-friendly: rows are keyed by `id` for dedupe.
   */
  fetchUnsynced(bridge: DeviceBridge, options?: { since?: string; limit?: number }): Promise<OrderlineRow[]>;
  /** Optional: called after jobs are enqueued so the source can advance a cursor. */
  markEnqueued?(bridge: DeviceBridge, rows: OrderlineRow[]): Promise<void>;
}

const registry = new Map<string, OrderlineSource>();

/** Register the orderline source that supplies rows for cloud sync. */
export function registerOrderlineSource(source: OrderlineSource): void {
  registry.set(source.type, source);
}

/** Remove a registered source (mainly for tests). */
export function unregisterOrderlineSource(type: string): void {
  registry.delete(type);
}

/** Clear all registrations (mainly for tests). */
export function clearOrderlineSources(): void {
  registry.clear();
}

/** Resolve a registered orderline source, or null if none. */
export function getOrderlineSource(type: string): OrderlineSource | null {
  return registry.get(type) ?? null;
}

/** List all registered orderline source types. */
export function listOrderlineSourceTypes(): string[] {
  return [...registry.keys()];
}
