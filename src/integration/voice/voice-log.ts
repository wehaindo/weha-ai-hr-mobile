// Voice log service — records voice-order sessions (transcript + parsed result)
// into ai_voice_logs via the DeviceBridge, for the settings usage/stats view.

import type { DeviceBridge } from '@/platform';
import type { ParsedItem } from './parse-order';

function randomHex(len: number): string {
  const bytes = new Uint8Array(len / 2);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function now(): string {
  return new Date().toISOString();
}

export interface VoiceLogRow {
  id: string;
  config_id: string | null;
  transcript: string | null;
  parsed_json: string | null;
  confidence: number | null;
  status: 'success' | 'error' | 'cancelled';
  error_message: string | null;
  duration_ms: number | null;
  created_at: string;
}

export class VoiceLogService {
  constructor(private bridge: DeviceBridge) {}

  async log(params: {
    configId?: string;
    transcript?: string;
    items?: ParsedItem[];
    confidence?: number;
    status: 'success' | 'error' | 'cancelled';
    error?: string;
    durationMs?: number;
  }): Promise<void> {
    await this.bridge.db.execute(
      `INSERT INTO ai_voice_logs (id, config_id, transcript, parsed_json, confidence, status, error_message, duration_ms, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        randomHex(16),
        params.configId ?? null,
        params.transcript ?? null,
        params.items ? JSON.stringify(params.items) : null,
        params.confidence ?? null,
        params.status,
        params.error ?? null,
        params.durationMs ?? null,
        now(),
      ]
    );
  }

  async listRecent(limit = 50): Promise<VoiceLogRow[]> {
    return this.bridge.db.query<VoiceLogRow>('SELECT * FROM ai_voice_logs ORDER BY created_at DESC LIMIT ?', [limit]);
  }

  /** Aggregated usage stats for the settings view. */
  async stats(): Promise<{ total: number; success: number; error: number; avgConfidence: number | null }> {
    const rows = await this.bridge.db.query<{ total: number; success: number; error: number; avg_conf: number | null }>(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS success,
              SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS error,
              AVG(confidence) AS avg_conf
       FROM ai_voice_logs`
    );
    const r = rows[0];
    return { total: r?.total ?? 0, success: r?.success ?? 0, error: r?.error ?? 0, avgConfidence: r?.avg_conf ?? null };
  }
}
