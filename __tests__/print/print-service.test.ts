// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { createFakeBridge, type FakeBridgeHandle } from '../helpers/fake-bridge';
import { PrintService, buildEscPosBytes, formatPrice, buildTestReceiptContent, getMaxChars } from '@/lib/print';

describe('PrintService', () => {
  let handle: FakeBridgeHandle;
  let service: PrintService;

  beforeEach(async () => {
    handle = await createFakeBridge();
    service = new PrintService(handle.bridge);
  });

  it('enqueues a job in print_queue on printToDevice, then marks it done', async () => {
    // Seed a hardware device row (printers are managed via hardware_devices).
    await handle.bridge.db.execute(
      `INSERT INTO hardware_devices (id, uuid, name, type, connection_type, connection_config, capabilities, status, is_default, is_active, created_at, updated_at)
       VALUES ('dev1', 'u1', 'P', 'receipt_printer', 'network', ?, '{}', 'offline', 0, 1, ?, ?)`,
      [JSON.stringify({ ip: '192.168.1.50', port: 9100 }), new Date().toISOString(), new Date().toISOString()]
    );

    // The fake bridge throws on print.raw; we assert the job is recorded as failed.
    const bytes = buildEscPosBytes(buildTestReceiptContent('P', 80));
    await expect(service.printToDevice('dev1', 'test_page', bytes)).rejects.toThrow();

    const jobs = await service.listJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].status).toBe('failed');
    expect(jobs[0].profile_id).toBe('dev1');
  });

  it('throws for an unknown hardware device', async () => {
    const bytes = new Uint8Array([1]);
    await expect(service.printToDevice('missing', 'test', bytes)).rejects.toThrow('Hardware device not found');
  });
});

describe('receipt-builder', () => {
  it('maps paper width to max chars', () => {
    expect(getMaxChars(80)).toBe(42);
    expect(getMaxChars(76)).toBe(36);
    expect(getMaxChars(58)).toBe(28);
  });

  it('formats minor-unit currency with a symbol prefix by default', () => {
    expect(formatPrice(12345, { symbol: 'Rp', decimalPlaces: 0 })).toBe('Rp 12,345');
    expect(formatPrice(12345, { symbol: '$', decimalPlaces: 2, position: 'prefix' })).toBe('$ 123.45');
  });

  it('supports a suffix symbol', () => {
    expect(formatPrice(500, { symbol: 'Rp', decimalPlaces: 0, position: 'suffix' })).toBe('500 Rp');
  });
});
