// Print service: printer profiles live in the printer_profiles table; sending
// goes through the platform bridge (raw TCP in Electron, unavailable on web).

import type { DeviceBridge } from '@/platform';
import { generateId } from '@/lib/id';

export type PrinterConnectionType = 'tcp' | 'driver';

export interface PrinterProfile {
  id: string;
  name: string;
  connection_type: PrinterConnectionType;
  target: string; // host:port for tcp, Windows printer name for driver
  width_mm: number;
  is_default: number;
  enabled: number;
  options: string;
  created_at: string;
  updated_at: string;
}

export interface PrinterProfileInput {
  name: string;
  connection_type: PrinterConnectionType;
  target: string;
  width_mm?: number;
  is_default?: boolean;
}

export type PrintJobStatus = 'pending' | 'done' | 'failed';

export interface PrintJob {
  id: number;
  profile_id: string | null;
  doc_type: string;
  payload: string;
  status: PrintJobStatus;
  retry_count: number;
  last_error: string | null;
  created_at: string;
  printed_at: string | null;
}

function now(): string {
  return new Date().toISOString();
}

export class PrintService {
  constructor(private bridge: DeviceBridge) {}

  // ---- profiles ----

  async listProfiles(): Promise<PrinterProfile[]> {
    return this.bridge.db.query<PrinterProfile>('SELECT * FROM printer_profiles ORDER BY is_default DESC, name ASC');
  }

  async createProfile(input: PrinterProfileInput): Promise<PrinterProfile> {
    const id = generateId();
    const timestamp = now();
    if (input.is_default) {
      await this.bridge.db.execute('UPDATE printer_profiles SET is_default = 0, updated_at = ?', [timestamp]);
    }
    await this.bridge.db.execute(
      `INSERT INTO printer_profiles (id, name, connection_type, target, width_mm, is_default, enabled, options, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, '{}', ?, ?)`,
      [
        id,
        input.name,
        input.connection_type,
        input.target,
        input.width_mm ?? 80,
        input.is_default ? 1 : 0,
        timestamp,
        timestamp,
      ]
    );
    const rows = await this.bridge.db.query<PrinterProfile>('SELECT * FROM printer_profiles WHERE id = ?', [id]);
    return rows[0];
  }

  async deleteProfile(id: string): Promise<void> {
    await this.bridge.db.execute('DELETE FROM printer_profiles WHERE id = ?', [id]);
  }

  async getDefaultProfile(): Promise<PrinterProfile | null> {
    const rows = await this.bridge.db.query<PrinterProfile>(
      'SELECT * FROM printer_profiles WHERE enabled = 1 ORDER BY is_default DESC LIMIT 1'
    );
    return rows[0] ?? null;
  }

  // ---- jobs ----

  /** Send bytes to a specific profile (or the default one). */
  async print(profileId: string | undefined, docType: string, bytes: Uint8Array, meta?: Record<string, unknown>): Promise<PrintJob> {
    const profile = profileId
      ? (await this.bridge.db.query<PrinterProfile>('SELECT * FROM printer_profiles WHERE id = ?', [profileId]))[0]
      : await this.getDefaultProfile();

    if (!profile) throw new Error('No printer profile configured');

    const jobId = await this.enqueue(profile.id, docType, bytes, meta);
    try {
      await this.bridge.print.raw(profile.target, bytes);
      await this.bridge.db.execute("UPDATE print_queue SET status = 'done', printed_at = ?, last_error = NULL WHERE id = ?", [
        now(),
        jobId,
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.bridge.db.execute(
        "UPDATE print_queue SET status = 'failed', retry_count = retry_count + 1, last_error = ? WHERE id = ?",
        [message, jobId]
      );
      throw err;
    }
    return this.getJob(jobId);
  }

  async testPrint(profileId?: string): Promise<PrintJob> {
    const profile = profileId
      ? (await this.bridge.db.query<PrinterProfile>('SELECT * FROM printer_profiles WHERE id = ?', [profileId]))[0]
      : await this.getDefaultProfile();
    if (!profile) throw new Error('No printer profile configured');

    const { buildTestPage } = await import('./escpos');
    return this.print(profile.id, 'test_page', buildTestPage(profile.name, profile.width_mm));
  }

  async listJobs(limit = 50): Promise<PrintJob[]> {
    return this.bridge.db.query<PrintJob>(
      'SELECT * FROM print_queue ORDER BY id DESC LIMIT ?',
      [limit]
    );
  }

  private async getJob(id: number): Promise<PrintJob> {
    const rows = await this.bridge.db.query<PrintJob>('SELECT * FROM print_queue WHERE id = ?', [id]);
    return rows[0];
  }

  private async enqueue(profileId: string, docType: string, bytes: Uint8Array, meta?: Record<string, unknown>): Promise<number> {
    // Store bytes as an array in JSON payload (small device docs — receipts/labels).
    const payload = JSON.stringify({
      bytes: Array.from(bytes),
      byteLength: bytes.byteLength,
      ...meta,
    });
    await this.bridge.db.execute(
      `INSERT INTO print_queue (profile_id, doc_type, payload, status, retry_count, created_at)
       VALUES (?, ?, ?, 'pending', 0, ?)`,
      [profileId, docType, payload, now()]
    );
    const rows = await this.bridge.db.query<{ id: number }>('SELECT last_insert_rowid() AS id');
    return rows[0].id;
  }
}
