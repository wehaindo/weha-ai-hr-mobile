// Data Hub entity registry — maps a hub `entity_type` to a local table for the
// apply step. The framework ships no domain tables, so a device app registers
// its own mappings. Unregistered entity types are skipped by the applier.

export interface HubEntityMapping {
  /** Physical table the event payload is written to. */
  table: string;
  /** Soft-delete column, if the table has one (deletes set it to 0). */
  activeColumn?: string;
}

const registry = new Map<string, HubEntityMapping>();
const aliases = new Map<string, string>();

/** Register a hub entity → local table mapping. */
export function registerHubEntity(type: string, mapping: HubEntityMapping): void {
  registry.set(type, mapping);
}

/** Alias a legacy/alternate hub entity type to an existing registered one. */
export function aliasHubEntity(alias: string, targetType: string): void {
  aliases.set(alias, targetType);
}

/** Remove a registration (mainly for tests). */
export function unregisterHubEntity(type: string): void {
  registry.delete(type);
  aliases.delete(type);
}

/** Clear all registrations + aliases (mainly for tests). */
export function clearHubEntities(): void {
  registry.clear();
  aliases.clear();
}

/** Resolve an entity type (following aliases) to its table mapping. */
export function getHubEntityMapping(type: string): HubEntityMapping | null {
  const resolved = aliases.get(type) ?? type;
  return registry.get(resolved) ?? null;
}

/** Resolve an aliased entity type to its canonical registered type. */
export function resolveHubEntityType(type: string): string {
  return aliases.get(type) ?? type;
}

/** List all registered hub entity types (canonical names). */
export function listHubEntityTypes(): string[] {
  return [...registry.keys()];
}
