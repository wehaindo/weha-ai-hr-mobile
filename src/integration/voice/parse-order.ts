// Voice order parsing — turns a transcript into structured order items via an
// LLM chat-completion call (through the DeviceBridge `cloud.request`). Returns a
// GENERIC result (`{items:[{name,qty,price}], confidence}`) — a device app maps
// items to its own cart, keeping the framework entity-agnostic.

import type { DeviceBridge } from '@/platform';
import type { VoiceConfigRow } from './config';

const OPENAI_BASE = 'https://api.openai.com/v1';

export interface ParsedItem {
  name: string;
  quantity: number;
  price?: number;
  confidence?: number;
}

export interface ParseResult {
  ok: boolean;
  items?: ParsedItem[];
  confidence?: number;
  error?: string;
  raw?: string;
}

const SYSTEM_PROMPT =
  'You parse spoken order text into JSON. Return ONLY a JSON object of the form ' +
  '{"items":[{"name":string,"quantity":number,"price":number?}],"confidence":number}. ' +
  'confidence is 0..1 for overall parse certainty. No prose.';

/** Resolve the LLM base URL for the configured provider. */
function baseUrlFor(config: VoiceConfigRow): string {
  if (config.base_url) return config.base_url.replace(/\/+$/, '');
  if (config.provider === 'deepseek') return 'https://api.deepseek.com/v1';
  return OPENAI_BASE;
}

/** Parse a transcript into generic order items via the configured LLM. */
export async function parseOrder(bridge: DeviceBridge, config: VoiceConfigRow, transcript: string): Promise<ParseResult> {
  const apiKey = config.api_key;
  if (!apiKey) return { ok: false, error: 'No LLM API key configured' };

  const res = await bridge.cloud.request({
    url: `${baseUrlFor(config)}/chat/completions`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: config.model || 'gpt-4o-mini',
      temperature: 0,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: transcript },
      ],
    }),
  });

  if (!res.ok) {
    return { ok: false, error: res.json?.error?.message ?? `Parse failed (HTTP ${res.status})` };
  }

  const content = res.json?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') return { ok: false, error: 'Empty LLM response' };

  return parseItemsFromContent(content);
}

/** Parse the LLM's JSON response into items + confidence (tolerant of fences). */
export function parseItemsFromContent(content: string): ParseResult {
  // Strip markdown code fences if present.
  const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();

  let parsed: { items?: Array<{ name?: string; quantity?: number; price?: number; confidence?: number }>; confidence?: number };
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return { ok: false, error: 'LLM response was not valid JSON', raw: content };
  }

  const items: ParsedItem[] = (parsed.items ?? [])
    .filter((i) => i && typeof i.name === 'string')
    .map((i) => ({
      name: String(i.name),
      quantity: typeof i.quantity === 'number' ? i.quantity : 1,
      price: typeof i.price === 'number' ? i.price : undefined,
      confidence: typeof i.confidence === 'number' ? i.confidence : undefined,
    }));

  const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : undefined;
  return { ok: true, items, confidence, raw: content };
}

/** Test the LLM endpoint with a models probe — validates the key. */
export async function testLlmConnection(bridge: DeviceBridge, config: VoiceConfigRow): Promise<{ ok: boolean; error?: string }> {
  const apiKey = config.api_key;
  if (!apiKey) return { ok: false, error: 'No LLM API key configured' };
  const res = await bridge.cloud.request({ url: `${baseUrlFor(config)}/models`, headers: { Authorization: `Bearer ${apiKey}` } });
  if (res.ok) return { ok: true };
  return { ok: false, error: res.json?.error?.message ?? `HTTP ${res.status}` };
}
