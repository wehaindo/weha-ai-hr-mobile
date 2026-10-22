// Voice transcription — sends recorded audio to a Whisper-compatible STT
// endpoint via the DeviceBridge `cloud.request` (multipart formData). Runs on
// web + Electron alike. Returns the transcript text.

import type { DeviceBridge } from '@/platform';
import type { VoiceConfigRow } from './config';

export interface TranscribeResult {
  ok: boolean;
  text?: string;
  error?: string;
}

const OPENAI_BASE = 'https://api.openai.com/v1';

/** Transcribe an audio clip using the configured STT provider. */
export async function transcribe(
  bridge: DeviceBridge,
  config: VoiceConfigRow,
  audio: Uint8Array,
  filename = 'audio.webm'
): Promise<TranscribeResult> {
  if (config.stt_provider === 'webspeech') {
    return { ok: false, error: 'Web Speech uses the browser recognizer (no server call)' };
  }

  const base = (config.stt_base_url || OPENAI_BASE).replace(/\/+$/, '');
  const apiKey = config.stt_api_key || config.api_key;
  if (!apiKey) return { ok: false, error: 'No STT API key configured' };

  const res = await bridge.cloud.request({
    url: `${base}/audio/transcriptions`,
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    formData: [
      { name: 'file', filename, bytes: audio, contentType: 'audio/webm' },
      { name: 'model', value: config.stt_model || 'whisper-1' },
      { name: 'language', value: config.language === 'auto' ? '' : config.language },
    ],
  });

  if (!res.ok || !res.json?.text) {
    return { ok: false, error: res.json?.error?.message ?? `Transcription failed (HTTP ${res.status})` };
  }
  return { ok: true, text: String(res.json.text) };
}

/** Test the STT endpoint with a tiny probe (models list) — validates the key. */
export async function testSttConnection(bridge: DeviceBridge, config: VoiceConfigRow): Promise<{ ok: boolean; error?: string }> {
  const base = (config.stt_base_url || OPENAI_BASE).replace(/\/+$/, '');
  const apiKey = config.stt_api_key || config.api_key;
  if (!apiKey) return { ok: false, error: 'No STT API key configured' };
  const res = await bridge.cloud.request({ url: `${base}/models`, headers: { Authorization: `Bearer ${apiKey}` } });
  if (res.ok) return { ok: true };
  return { ok: false, error: res.json?.error?.message ?? `HTTP ${res.status}` };
}
