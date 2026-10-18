import type { Migration } from '../migrate';

// Ai Voice configuration, adopted from ai-pos. An LLM+STT config (masked API
// keys), voice-order session logs, and a product-alias map for voice→product
// resolution. The framework ships no product table; aliases are generic
// name→target rows a device app resolves against its own catalog.
export const migration0015AiVoice: Migration = {
  id: '0015_ai_voice',
  up: (db) => {
    db.execute(`
      CREATE TABLE ai_configs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL DEFAULT 'Default',
        provider TEXT NOT NULL DEFAULT 'openai' CHECK (provider IN ('openai', 'deepseek', 'custom')),
        base_url TEXT,
        api_key TEXT,
        model TEXT NOT NULL DEFAULT 'gpt-4o-mini',
        stt_provider TEXT NOT NULL DEFAULT 'openai' CHECK (stt_provider IN ('openai', 'webspeech', 'auto')),
        stt_model TEXT NOT NULL DEFAULT 'whisper-1',
        stt_api_key TEXT,
        stt_base_url TEXT,
        language TEXT NOT NULL DEFAULT 'auto',
        confidence_threshold REAL NOT NULL DEFAULT 0.9,
        confirm_threshold REAL NOT NULL DEFAULT 0.7,
        max_recording_seconds INTEGER NOT NULL DEFAULT 15,
        min_recording_seconds INTEGER NOT NULL DEFAULT 1,
        rate_limit_per_hour INTEGER NOT NULL DEFAULT 60,
        enabled INTEGER NOT NULL DEFAULT 0,
        last_test_at TEXT,
        last_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    db.execute(`
      CREATE TABLE ai_voice_logs (
        id TEXT PRIMARY KEY,
        config_id TEXT,
        transcript TEXT,
        parsed_json TEXT,
        confidence REAL,
        status TEXT NOT NULL CHECK (status IN ('success', 'error', 'cancelled')),
        error_message TEXT,
        duration_ms INTEGER,
        created_at TEXT NOT NULL
      )
    `);
    db.execute(`CREATE INDEX idx_ai_voice_logs_created ON ai_voice_logs(created_at)`);

    db.execute(`
      CREATE TABLE product_aliases (
        id TEXT PRIMARY KEY,
        alias TEXT NOT NULL UNIQUE,
        target TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
  },
};
