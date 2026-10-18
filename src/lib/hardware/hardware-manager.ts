// Hardware device registry service — CRUD over the hardware_devices table via
// the DeviceBridge, plus device I/O (test/discover/drawer) through the bridge's
// hardware capability. No per-entity IPC; device records are plain DB rows.

import type { DeviceBridge } from '@/platform';
import type { HardwareDevice, HardwareDeviceType, HardwareConnectionType, HardwareDeviceStatus } from '@/types';
import { PrinterAdapter, targetFromConnection, type PrinterConnectionConfig } from '@/lib/print/printer-adapter';

function now(): string {
  return new Date().toISOString();
}

function randomHex(len: number): string {
  const bytes = new Uint8Array(len / 2);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export interface HardwareDeviceInput {
  name: string;
  type: HardwareDeviceType;
  connection_type: HardwareConnectionType;
  connection_config?: Record<string, unknown>;
  manufacturer?: string;
  model?: string;
  location?: string;
  assigned_to?: string;
  is_default?: boolean;
}

/** Resolve the bridge `print.raw` target for a device (network/driver only). */
export function resolveTarget(device: HardwareDevice): string {
  return targetFromConnection(PrinterAdapter.resolveConnection(device.connection_type, device.connection_config));
}

/** Resolve the full connection config for a device. */
export function resolveConnection(device: HardwareDevice): PrinterConnectionConfig {
  return PrinterAdapter.resolveConnection(device.connection_type, device.connection_config);
}

export class HardwareService {
  constructor(private bridge: DeviceBridge) {}

  async list(includeInactive = true): Promise<HardwareDevice[]> {
    const sql = includeInactive
      ? 'SELECT * FROM hardware_devices ORDER BY type ASC, name ASC'
      : 'SELECT * FROM hardware_devices WHERE is_active = 1 ORDER BY type ASC, name ASC';
    return this.bridge.db.query<HardwareDevice>(sql);
  }

  async listByType(type: HardwareDeviceType): Promise<HardwareDevice[]> {
    return this.bridge.db.query<HardwareDevice>(
      'SELECT * FROM hardware_devices WHERE type = ? AND is_active = 1 ORDER BY is_default DESC, name ASC',
      [type]
    );
  }

  async get(id: string): Promise<HardwareDevice | null> {
    const rows = await this.bridge.db.query<HardwareDevice>('SELECT * FROM hardware_devices WHERE id = ?', [id]);
    return rows[0] ?? null;
  }

  /** Default device for a type (is_default = 1), falling back to the first active. */
  async getDefault(type: HardwareDeviceType): Promise<HardwareDevice | null> {
    const def = await this.bridge.db.query<HardwareDevice>(
      'SELECT * FROM hardware_devices WHERE type = ? AND is_default = 1 AND is_active = 1 LIMIT 1',
      [type]
    );
    if (def[0]) return def[0];
    const any = await this.bridge.db.query<HardwareDevice>(
      'SELECT * FROM hardware_devices WHERE type = ? AND is_active = 1 LIMIT 1',
      [type]
    );
    return any[0] ?? null;
  }

  async create(input: HardwareDeviceInput): Promise<HardwareDevice> {
    const id = randomHex(16);
    const uuid = `${randomHex(8)}-${randomHex(4)}-${randomHex(4)}-${randomHex(4)}-${randomHex(12)}`;
    const timestamp = now();

    if (input.is_default) {
      await this.bridge.db.execute('UPDATE hardware_devices SET is_default = 0, updated_at = ? WHERE type = ?', [
        timestamp,
        input.type,
      ]);
    }

    await this.bridge.db.execute(
      `INSERT INTO hardware_devices (
        id, uuid, name, type, connection_type, connection_config, capabilities, status,
        manufacturer, model, is_default, is_active, assigned_to, location, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, '{}', 'offline', ?, ?, ?, 1, ?, ?, ?, ?)`,
      [
        id,
        uuid,
        input.name,
        input.type,
        input.connection_type,
        JSON.stringify(input.connection_config ?? {}),
        input.manufacturer ?? null,
        input.model ?? null,
        input.is_default ? 1 : 0,
        input.assigned_to ?? null,
        input.location ?? null,
        timestamp,
        timestamp,
      ]
    );

    return (await this.get(id))!;
  }

  async update(id: string, patch: Partial<HardwareDeviceInput> & { is_active?: number; status?: HardwareDeviceStatus; error_message?: string | null }): Promise<void> {
    const fields: string[] = [];
    const params: unknown[] = [];

    const set = (col: string, value: unknown) => {
      fields.push(`${col} = ?`);
      params.push(value);
    };

    if (patch.name !== undefined) set('name', patch.name);
    if (patch.connection_type !== undefined) set('connection_type', patch.connection_type);
    if (patch.connection_config !== undefined) set('connection_config', JSON.stringify(patch.connection_config));
    if (patch.manufacturer !== undefined) set('manufacturer', patch.manufacturer);
    if (patch.model !== undefined) set('model', patch.model);
    if (patch.location !== undefined) set('location', patch.location);
    if (patch.assigned_to !== undefined) set('assigned_to', patch.assigned_to);
    if (patch.is_active !== undefined) set('is_active', patch.is_active);
    if (patch.status !== undefined) set('status', patch.status);
    if (patch.error_message !== undefined) set('error_message', patch.error_message);

    if (fields.length === 0) return;
    set('updated_at', now());
    params.push(id);

    await this.bridge.db.execute(`UPDATE hardware_devices SET ${fields.join(', ')} WHERE id = ?`, params);
  }

  async remove(id: string): Promise<void> {
    await this.bridge.db.execute('DELETE FROM hardware_devices WHERE id = ?', [id]);
  }

  /** Make this device the default for its type (clears others of the same type). */
  async setDefault(id: string): Promise<void> {
    const device = await this.get(id);
    if (!device) return;
    const timestamp = now();
    await this.bridge.db.execute('UPDATE hardware_devices SET is_default = 0, updated_at = ? WHERE type = ?', [
      timestamp,
      device.type,
    ]);
    await this.bridge.db.execute('UPDATE hardware_devices SET is_default = 1, updated_at = ? WHERE id = ?', [timestamp, id]);
  }

  /** Probe connectivity and update the stored status. */
  async test(id: string): Promise<{ ok: boolean; message?: string }> {
    const device = await this.get(id);
    if (!device) return { ok: false, message: 'Device not found' };

    const target = resolveTarget(device);
    const result = await this.bridge.hardware.test(target);

    await this.update(id, {
      status: result.ok ? 'online' : 'error',
      error_message: result.ok ? null : result.message ?? 'Test failed',
    });
    if (result.ok) {
      await this.bridge.db.execute('UPDATE hardware_devices SET last_seen_at = ? WHERE id = ?', [now(), id]);
    }
    await this.log(id, 'test', result.ok ? 'success' : 'error', result.message);
    return result;
  }

  /** Enumerate candidate devices (serial ports / printers) for setup UIs. */
  async discover() {
    return this.bridge.hardware.discover();
  }

  /** Open a cash drawer attached to a device (or the default receipt printer). */
  async openDrawer(deviceId?: string): Promise<void> {
    const device = deviceId ? await this.get(deviceId) : await this.getDefault('cash_drawer');
    const target = device ? resolveTarget(device) : undefined;
    if (!target) throw new Error('No cash drawer configured');
    await this.bridge.hardware.openDrawer(target);
  }

  /** Append a hardware log row (audit trail). */
  async log(deviceId: string | null, action: string, status: 'success' | 'error' | 'warning', message?: string): Promise<void> {
    await this.bridge.db.execute(
      `INSERT INTO hardware_logs (id, device_id, action, status, message, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [randomHex(16), deviceId, action, status, message ?? null, now()]
    );
  }
}
