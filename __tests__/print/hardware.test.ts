// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { createFakeBridge, type FakeBridgeHandle } from '../helpers/fake-bridge';
import { HardwareService, resolveTarget } from '@/lib/hardware/hardware-manager';
import type { HardwareDevice } from '@/types';

describe('resolveTarget', () => {
  it('builds a TCP host:port target for network devices', () => {
    const device = {
      connection_type: 'network',
      connection_config: JSON.stringify({ ip: '192.168.1.50', port: 9100 }),
    } as unknown as HardwareDevice;
    expect(resolveTarget(device)).toBe('192.168.1.50:9100');
  });

  it('defaults the TCP port to 9100', () => {
    const device = {
      connection_type: 'network',
      connection_config: JSON.stringify({ ip: '10.0.0.5' }),
    } as unknown as HardwareDevice;
    expect(resolveTarget(device)).toBe('10.0.0.5:9100');
  });

  it('returns the system name for usb devices', () => {
    const device = {
      connection_type: 'usb',
      connection_config: JSON.stringify({ system_name: 'POS-PRINTER' }),
    } as unknown as HardwareDevice;
    expect(resolveTarget(device)).toBe('POS-PRINTER');
  });

  it('returns a serial: target for serial devices', () => {
    const device = {
      connection_type: 'serial',
      connection_config: JSON.stringify({ port_path: 'COM3', baud_rate: 9600 }),
    } as unknown as HardwareDevice;
    expect(resolveTarget(device)).toBe('serial:COM3@9600');
  });
});

describe('HardwareService', () => {
  let handle: FakeBridgeHandle;
  let service: HardwareService;

  beforeEach(async () => {
    handle = await createFakeBridge();
    service = new HardwareService(handle.bridge);
  });

  it('creates and lists a device', async () => {
    await service.create({
      name: 'Counter printer',
      type: 'receipt_printer',
      connection_type: 'network',
      connection_config: { ip: '192.168.1.50', port: 9100 },
    });

    const devices = await service.list();
    expect(devices).toHaveLength(1);
    expect(devices[0].name).toBe('Counter printer');
    expect(devices[0].status).toBe('offline');
    expect(devices[0].is_active).toBe(1);
  });

  it('stores connection_config as JSON and resolves targets', async () => {
    const created = await service.create({
      name: 'Kitchen printer',
      type: 'kitchen_printer',
      connection_type: 'network',
      connection_config: { ip: '192.168.1.60', port: 9100 },
    });
    expect(resolveTarget(created)).toBe('192.168.1.60:9100');
  });

  it('enforces a single default per type', async () => {
    const a = await service.create({ name: 'A', type: 'receipt_printer', connection_type: 'network', connection_config: {}, is_default: true });
    const b = await service.create({ name: 'B', type: 'receipt_printer', connection_type: 'network', connection_config: {}, is_default: true });

    const def = await service.getDefault('receipt_printer');
    expect(def?.id).toBe(b.id);
    // Re-fetch A: creating B as default clears A's flag in the DB.
    const refreshedA = await service.get(a.id);
    expect(refreshedA?.is_default).toBe(0);
    expect(b.is_default).toBe(1);
  });

  it('setDefault clears other defaults of the same type', async () => {
    const a = await service.create({ name: 'A', type: 'receipt_printer', connection_type: 'network', connection_config: {}, is_default: true });
    const b = await service.create({ name: 'B', type: 'receipt_printer', connection_type: 'network', connection_config: {} });

    await service.setDefault(b.id);
    const def = await service.getDefault('receipt_printer');
    expect(def?.id).toBe(b.id);

    const refreshedA = await service.get(a.id);
    expect(refreshedA?.is_default).toBe(0);
  });

  it('updates a device and removes it', async () => {
    const device = await service.create({ name: 'Temp', type: 'scanner', connection_type: 'usb', connection_config: {} });
    await service.update(device.id, { name: 'Renamed' });
    const updated = await service.get(device.id);
    expect(updated?.name).toBe('Renamed');

    await service.remove(device.id);
    expect(await service.get(device.id)).toBeNull();
  });

  it('filters by type', async () => {
    await service.create({ name: 'P', type: 'receipt_printer', connection_type: 'network', connection_config: {} });
    await service.create({ name: 'D', type: 'cash_drawer', connection_type: 'network', connection_config: {} });

    const printers = await service.listByType('receipt_printer');
    expect(printers).toHaveLength(1);
    expect(printers[0].type).toBe('receipt_printer');
  });

  it('writes a hardware log row', async () => {
    const device = await service.create({ name: 'P', type: 'receipt_printer', connection_type: 'network', connection_config: {} });
    await service.log(device.id, 'test', 'success', 'ok');
    const logs = await handle.bridge.db.query<{ action: string }>('SELECT action FROM hardware_logs');
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe('test');
  });
});
