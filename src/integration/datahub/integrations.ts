import type { DeviceBridge } from '@/platform';
import { getIntegrationEntityDef } from '../entities';
import { getHubEntityMapping, registerHubEntity } from '../hub-entities';

/**
 * Register every enabled `sync_source='datahub'` integration's table as a hub
 * entity, so the data hub worker pushes/pulls it. This is the bridge that lets an
 * integration choose "Sync via: Data Hub" while the row itself lives in
 * `integration_entities`.
 *
 * Skips types already registered (e.g. the Testing module's mapping, which may
 * carry an `activeColumn` for soft deletes) so an existing registration is never
 * clobbered. The registry is in-memory, so a row flipped away from datahub is
 * dropped on the next reload; call this again after a save to pick up additions.
 *
 * @param bridge database handle
 */
export async function registerDatahubIntegrations(bridge: DeviceBridge): Promise<void> {
  const rows = await bridge.db.query<{ entity_type: string }>(
    "SELECT DISTINCT entity_type FROM integration_entities WHERE sync_source = 'datahub' AND enabled = 1"
  );
  for (const row of rows) {
    if (getHubEntityMapping(row.entity_type)) continue;
    const def = getIntegrationEntityDef(row.entity_type);
    registerHubEntity(row.entity_type, { table: def.table });
  }
}
