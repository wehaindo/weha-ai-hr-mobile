import { beforeEach, describe, expect, it } from 'vitest';
import { createFakeBridge, type FakeBridgeHandle } from '../helpers/fake-bridge';
import { deleteDraft, listDrafts, loadDraft, MAX_DRAFTS, newDraftId, saveDraft, type RequestDraft } from '@/lib/ess/requests/drafts';

let handle: FakeBridgeHandle;

function draft(id: string, savedAt: string): RequestDraft {
  return { id, type: 'LEAVE', form: { reason: 'test' }, attachmentNames: ['a.pdf'], savedAt };
}

beforeEach(async () => {
  handle = await createFakeBridge();
});

describe('request drafts (client-local, BRD §7)', () => {
  it('round-trips a draft through bridge.kv', async () => {
    await saveDraft(handle.bridge, draft('d1', '2026-10-22T08:00:00.000Z'));

    const loaded = await loadDraft(handle.bridge, 'd1');
    expect(loaded?.form).toEqual({ reason: 'test' });
    expect(loaded?.attachmentNames).toEqual(['a.pdf']);
  });

  it('upserts by id and sorts newest first', async () => {
    await saveDraft(handle.bridge, draft('d1', '2026-10-22T08:00:00.000Z'));
    await saveDraft(handle.bridge, { ...draft('d1', '2026-10-22T09:00:00.000Z'), form: { reason: 'updated' } });
    await saveDraft(handle.bridge, draft('d2', '2026-10-22T07:00:00.000Z'));

    const drafts = await listDrafts(handle.bridge);
    expect(drafts.map((d) => d.id)).toEqual(['d1', 'd2']);
    expect(drafts[0].form).toEqual({ reason: 'updated' });
  });

  it('caps the stored drafts at MAX_DRAFTS (oldest dropped)', async () => {
    for (let i = 0; i < MAX_DRAFTS + 3; i++) {
      await saveDraft(handle.bridge, draft(`d${i}`, `2026-10-22T0${i % 10}:00:00.000Z`));
    }
    const drafts = await listDrafts(handle.bridge);
    expect(drafts).toHaveLength(MAX_DRAFTS);
  });

  it('deletes a draft and tolerates unknown ids', async () => {
    await saveDraft(handle.bridge, draft('d1', '2026-10-22T08:00:00.000Z'));
    await deleteDraft(handle.bridge, 'd1');
    await deleteDraft(handle.bridge, 'missing');

    expect(await listDrafts(handle.bridge)).toHaveLength(0);
    expect(await loadDraft(handle.bridge, 'd1')).toBeNull();
  });

  it('newDraftId is a 16-hex idempotency-safe key', () => {
    expect(newDraftId()).toMatch(/^[0-9a-f]{16}$/);
    expect(newDraftId()).not.toBe(newDraftId());
  });

  it('ignores corrupt stored values', async () => {
    await handle.bridge.kv.set('ess.drafts', 'not-an-array');
    expect(await listDrafts(handle.bridge)).toEqual([]);
  });
});
