// Client-local request drafts (BRD §7 "draft preparation when appropriate").
// Stored in device_settings via bridge.kv — drafts never leave the device and
// are NOT server state (contract §7 adaptation). Files are not persisted:
// only their names survive a restore, and the user re-attaches them.

import type { DeviceBridge } from '@/platform';
import { generateId } from '@/lib/id';
import type { EssRequestType } from '@/integration/ess/requests';

const DRAFTS_KEY = 'ess.drafts';
export const MAX_DRAFTS = 10;

export interface RequestDraft {
  /** Also the submission idempotency key — a retried submit can never duplicate. */
  id: string;
  type: EssRequestType;
  form: Record<string, unknown>;
  attachmentNames: string[];
  savedAt: string;
}

function isDraft(value: unknown): value is RequestDraft {
  const draft = value as RequestDraft | null;
  return !!draft && typeof draft.id === 'string' && typeof draft.type === 'string' && !!draft.form;
}

export function newDraftId(): string {
  return generateId();
}

export async function listDrafts(bridge: DeviceBridge): Promise<RequestDraft[]> {
  try {
    const stored = await bridge.kv.get<unknown>(DRAFTS_KEY);
    if (!Array.isArray(stored)) return [];
    return stored.filter(isDraft).sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
  } catch {
    return [];
  }
}

/** Upsert by id, newest first, capped (oldest dropped). Durable immediately —
 * a reload right after "Save draft" must never lose it (kv writes are
 * debounced by the engine). */
export async function saveDraft(bridge: DeviceBridge, draft: RequestDraft): Promise<void> {
  const drafts = await listDrafts(bridge);
  const next = [draft, ...drafts.filter((d) => d.id !== draft.id)].slice(0, MAX_DRAFTS);
  await bridge.kv.set(DRAFTS_KEY, next);
  await bridge.db.flush();
}

export async function loadDraft(bridge: DeviceBridge, id: string): Promise<RequestDraft | null> {
  const drafts = await listDrafts(bridge);
  return drafts.find((d) => d.id === id) ?? null;
}

export async function deleteDraft(bridge: DeviceBridge, id: string): Promise<void> {
  const drafts = await listDrafts(bridge);
  await bridge.kv.set(
    DRAFTS_KEY,
    drafts.filter((d) => d.id !== id)
  );
  await bridge.db.flush();
}
