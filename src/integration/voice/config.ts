// Voice config service — CRUD over ai_configs via the DeviceBridge. Holds the
// LLM + STT provider settings (API keys stored; the UI masks them for display).

import type { DeviceBridge } from '@/platform';

function randomHex(len: number): string {
  const bytes = new Uint8Array(len / 2);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function now(): string {
  return new Date().toISOString();
}

export interface VoiceConfigRow {
  id: string;
  name: string;
  provider: 'openai' | 'deepseek' | 'custom';
  base_url: string | null;
  api_key: string | null;
  model: string;
  stt_provider: 'openai' | 'webspeech' | 'auto';
  stt_model: string;
  stt_api_key: string | null;
  stt_base_url: string | null;
  language: string;
  confidence_threshold: number;
  confirm_threshold: number;
  max_recording_seconds: number;
  min_recording_seconds: number;
  rate_limit_per_hour: number;
  enabled: number;
  last_test_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface VoiceConfigInput {
  name?: string;
  provider?: 'openai' | 'deepseek' | 'custom';
  base_url?: string;
  api_key?: string;
  model?: string;
  stt_provider?: 'openai' | 'webspeech' | 'auto';
  stt_model?: string;
  stt_api_key?: string;
  stt_base_url?: string;
  language?: string;
  confidence_threshold?: number;
  confirm_threshold?: number;
  max_recording_seconds?: number;
  min_recording_seconds?: number;
  rate_limit_per_hour?: number;
  enabled?: boolean;
}

export class VoiceConfigService {
  constructor(private bridge: DeviceBridge) {}

  async getConfig(): Promise<VoiceConfigRow | null> {
    const rows = await this.bridge.db.query<VoiceConfigRow>('SELECT * FROM ai_configs ORDER BY created_at ASC LIMIT 1');
    return rows[0] ?? null;
  }

  async saveConfig(input: VoiceConfigInput): Promise<VoiceConfigRow> {
    const existing = await this.getConfig();
    const timestamp = now();

    if (existing) {
      const fields: string[] = [];
      const params: unknown[] = [];
      const set = (col: string, value: unknown) => {
        fields.push(`${col} = ?`);
        params.push(value);
      };
      for (const key of Object.keys(input) as Array<keyof VoiceConfigInput>) {
        if (input[key] !== undefined) {
          if (key === 'enabled') set('enabled', input.enabled ? 1 : 0);
          else set(key, input[key]);
        }
      }
      if (fields.length === 0) return existing;
      set('updated_at', timestamp);
      params.push(existing.id);
      await this.bridge.db.execute(`UPDATE ai_configs SET ${fields.join(', ')} WHERE id = ?`, params);
      return (await this.getConfig())!;
    }

    const id = randomHex(16);
    await this.bridge.db.execute(
      `INSERT INTO ai_configs (id, name, provider, base_url, api_key, model, stt_provider, stt_model, stt_api_key, stt_base_url, language, confidence_threshold, confirm_threshold, max_recording_seconds, min_recording_seconds, rate_limit_per_hour, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.name ?? 'Default',
        input.provider ?? 'openai',
        input.base_url ?? null,
        input.api_key ?? null,
        input.model ?? 'gpt-4o-mini',
        input.stt_provider ?? 'openai',
        input.stt_model ?? 'whisper-1',
        input.stt_api_key ?? null,
        input.stt_base_url ?? null,
        input.language ?? 'auto',
        input.confidence_threshold ?? 0.9,
        input.confirm_threshold ?? 0.7,
        input.max_recording_seconds ?? 15,
        input.min_recording_seconds ?? 1,
        input.rate_limit_per_hour ?? 60,
        input.enabled ? 1 : 0,
        timestamp,
        timestamp,
      ]
    );
    return (await this.getConfig())!;
  }

  async setEnabled(enabled: boolean): Promise<void> {
    const existing = await this.getConfig();
    if (!existing) return;
    await this.bridge.db.execute('UPDATE ai_configs SET enabled = ?, updated_at = ? WHERE id = ?', [enabled ? 1 : 0, now(), existing.id]);
  }

  async recordTest(ok: boolean, error?: string): Promise<void> {
    const existing = await this.getConfig();
    if (!existing) return;
    await this.bridge.db.execute('UPDATE ai_configs SET last_test_at = ?, last_error = ?, updated_at = ? WHERE id = ?', [
      now(),
      ok ? null : (error ?? 'Test failed'),
      now(),
      existing.id,
    ]);
  }
}
