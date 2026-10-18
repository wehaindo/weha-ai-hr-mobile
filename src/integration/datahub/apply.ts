// Write-through apply — maps Data Hub sync events to local SQLite tables via the
// DeviceBridge. Hub sends POS-aligned columns + optional tenant_id/version; this
// mapper strips hub-only columns and adds defaults for NOT-NULL gaps. Entity →
// table mappings come from the hub-entities registry (the framework ships no
// domain tables; a device app registers its own).

import type { DeviceBridge } from '@/platform';
import { getHubEntityMapping, resolveHubEntityType } from '../hub-entities';
import type { SyncEvent } from './client';

// Hub-only columns stripped before writing locally.
const HUB_ONLY_COLUMNS = new Set(['tenant_id', 'version', 'updated_at']);

// NOT-NULL defaults for known framework tables (extendable by device apps via registry).
const COLUMN_DEFAULTS: Record<string, Record<string, unknown>> = {};

export interface ApplyResult {
  status: 'applied' | 'skipped' | 'error';
  local_id?: string;
  error?: string;
}

function filterColumns(payload: Record<string, unknown>, tableName: string): Record<string, unknown> {
  const defaults = COLUMN_DEFAULTS[tableName] ?? {};
  const filtered: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(payload)) {
    if (HUB_ONLY_COLUMNS.has(key)) continue;
    filtered[key] = value;
  }

  for (const [key, defaultValue] of Object.entries(defaults)) {
    if (!(key in filtered) || filtered[key] === null || filtered[key] === undefined) {
      filtered[key] = defaultValue;
    }
  }

  return filtered;
}

async function resolveLocalId(bridge: DeviceBridge, remoteId: string, entityType: string): Promise<string | null> {
  const rows = await bridge.db.query<{ local_id: string }>(
    'SELECT local_id FROM datahub_entity_map WHERE entity_type = ? AND remote_id = ? LIMIT 1',
    [entityType, remoteId]
  );
  return rows[0]?.local_id ?? remoteId;
}

export async function applyEvent(bridge: DeviceBridge, event: SyncEvent): Promise<ApplyResult> {
  const entityType = resolveHubEntityType(event.entity_type);
  const mapping = getHubEntityMapping(entityType);
  if (!mapping) {
    return { status: 'skipped', error: `Unknown entity type: ${event.entity_type}` };
  }

  try {
    const payload = (event.payload ?? {}) as Record<string, unknown>;
    const remoteId = (event.entity_id ?? payload.id) as string | null;

    if (event.action === 'create') {
      if (!remoteId) return { status: 'skipped', error: 'No entity_id provided' };
      const filtered = filterColumns({ ...payload, id: remoteId }, mapping.table);
      const columns = Object.keys(filtered);
      const values = columns.map((k) => filtered[k]);
      const placeholders = columns.map(() => '?').join(', ');

      await bridge.db.execute(
        `INSERT OR REPLACE INTO ${mapping.table} (${columns.join(', ')}) VALUES (${placeholders})`,
        values
      );
      return { status: 'applied', local_id: remoteId };
    }

    if (event.action === 'update') {
      if (!remoteId) return { status: 'skipped', error: 'No entity_id provided' };
      const localId = await resolveLocalId(bridge, remoteId, entityType);
      if (!localId) return { status: 'skipped', error: 'No local mapping found' };

      const filtered = filterColumns(payload, mapping.table);
      const setParts: string[] = [];
      const setValues: unknown[] = [];
      for (const [key, value] of Object.entries(filtered)) {
        if (key === 'id' || key === 'created_at') continue;
        setParts.push(`${key} = ?`);
        setValues.push(value);
      }
      if (setParts.length === 0) return { status: 'skipped', error: 'Nothing to update' };

      setValues.push(localId);
      await bridge.db.execute(
        `UPDATE ${mapping.table} SET ${setParts.join(', ')}, updated_at = datetime('now') WHERE id = ?`,
        setValues
      );
      return { status: 'applied', local_id: localId };
    }

    if (event.action === 'delete') {
      if (!remoteId) return { status: 'skipped', error: 'No entity_id provided' };
      const localId = await resolveLocalId(bridge, remoteId, entityType);
      if (!localId) return { status: 'skipped', error: 'No local mapping found' };

      if (mapping.activeColumn) {
        await bridge.db.execute(
          `UPDATE ${mapping.table} SET ${mapping.activeColumn} = 0, updated_at = datetime('now') WHERE id = ?`,
          [localId]
        );
      } else {
        await bridge.db.execute(`DELETE FROM ${mapping.table} WHERE id = ?`, [localId]);
      }
      return { status: 'applied', local_id: localId };
    }

    return { status: 'skipped', error: `Unknown action: ${event.action}` };
  } catch (error) {
    return { status: 'error', error: error instanceof Error ? error.message : String(error) };
  }
}
