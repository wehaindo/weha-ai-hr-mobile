// Per-entity sync registry — a device app registers the domain entities it
// wants synced (and their table + natural key). The framework ships no domain
// tables, so nothing is seeded here; an unregistered entity falls back to
// `{ table: entity_type, keys: null }` (upsert by primary key only).

export interface IntegrationEntityDef {
  /** Entity type / table name by default. */
  type: string;
  /** Physical table the entity maps to. Defaults to `type`. */
  table?: string;
  /**
   * Natural-key columns used for pull upsert (match → UPDATE, else INSERT).
   * `null` means upsert by primary key / insert-only.
   */
  keys?: string[] | null;
  /**
   * Delta column for incremental push (e.g. `updated_at`). Rows with
   * `deltaColumn >= push_cursor` are sent; the cursor advances only on a clean run.
   */
  deltaColumn?: string;
  /** Attach an idempotency key to pushed payloads so the receiver can dedupe. */
  idempotency?: boolean;
}

/** A fully-resolved entity def (all fields present after registry fallback). */
export interface ResolvedIntegrationEntityDef {
  type: string;
  table: string;
  keys: string[] | null;
  deltaColumn?: string;
  idempotency: boolean;
}

const registry = new Map<string, IntegrationEntityDef>();

/** Register an entity for per-entity REST sync. */
export function registerIntegrationEntity(def: IntegrationEntityDef): void {
  registry.set(def.type, { ...def, table: def.table ?? def.type });
}

/** Remove a registered entity (mainly for tests). */
export function unregisterIntegrationEntity(type: string): void {
  registry.delete(type);
}

/** Clear all registrations (mainly for tests). */
export function clearIntegrationEntities(): void {
  registry.clear();
}

/** Resolve an entity def, falling back to table=type with no natural key. */
export function getIntegrationEntityDef(type: string): ResolvedIntegrationEntityDef {
  const def = registry.get(type);
  if (!def) return { type, table: type, keys: null, idempotency: false };
  return {
    type,
    table: def.table ?? type,
    keys: def.keys ?? null,
    deltaColumn: def.deltaColumn,
    idempotency: def.idempotency ?? false,
  };
}

/** List all registered entity types. */
export function listIntegrationEntityTypes(): string[] {
  return [...registry.keys()];
}
