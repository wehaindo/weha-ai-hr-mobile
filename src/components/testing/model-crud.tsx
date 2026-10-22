'use client';

// Generic CRUD for one testing model: loads rows for the model's table, renders
// the metadata-driven table, and handles create/edit (dynamic form) + delete via
// parameterized bridge.db writes. No per-model code. Rendered by the `[model]`
// route (which supplies generateStaticParams for static export).

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useBridge } from '@/platform';
import { generateId } from '@/lib/id';
import { toast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, ArrowLeft } from 'lucide-react';
import ModelTable from '@/components/testing/model-table';
import ModelForm from '@/components/testing/model-form';
import { getTestModel } from '@/testing/registry';
import type { FieldMeta, FieldSource, FieldOption, TestModelMeta } from '@/testing/models';

type Values = Record<string, string | number | boolean>;

function now(): string {
  return new Date().toISOString();
}

/** Convert a form value to its DB representation for a field. */
function toDbValue(f: FieldMeta, raw: string | number | boolean): string | number | null {
  if (f.type === 'boolean') return raw ? 1 : 0;
  if (f.type === 'number') return Number(raw ?? 0);
  const s = String(raw ?? '').trim();
  return s === '' ? null : s;
}

export default function ModelCrud() {
  const params = useParams<{ model: string }>();
  const modelId = Array.isArray(params.model) ? params.model[0] : params.model;
  const bridge = useBridge();
  const meta: TestModelMeta | null = getTestModel(modelId ?? '');

  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    if (!meta) return;
    setRows(await bridge.db.query(`SELECT * FROM ${meta.table}`));
  }, [bridge, meta]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadOptions = useCallback(
    async (source: FieldSource): Promise<FieldOption[]> => {
      const src = getTestModel(source.model);
      if (!src) return [];
      const opts = await bridge.db.query<{ value: unknown; label: unknown }>(
        `SELECT ${source.valueField} AS value, ${source.labelField} AS label FROM ${src.table} ORDER BY ${source.labelField} ASC`
      );
      return opts.map((o) => ({ value: String(o.value), label: String(o.label) }));
    },
    [bridge]
  );

  async function save(values: Values): Promise<void> {
    if (!meta) return;
    setBusy(true);
    try {
      const ts = now();
      if (creating) {
        const id = generateId();
        const cols = [meta.idColumn, ...meta.fields.map((f) => f.name), ...(meta.createdAtColumn ? [meta.createdAtColumn] : []), ...(meta.updatedAtColumn ? [meta.updatedAtColumn] : [])];
        const vals = [
          id,
          ...meta.fields.map((f) => toDbValue(f, values[f.name])),
          ...(meta.createdAtColumn ? [ts] : []),
          ...(meta.updatedAtColumn ? [ts] : []),
        ];
        const placeholders = cols.map(() => '?').join(', ');
        await bridge.db.execute(`INSERT INTO ${meta.table} (${cols.join(', ')}) VALUES (${placeholders})`, vals);
        toast.add({ title: 'Row created', type: 'success' });
      } else if (editing) {
        const sets = [...meta.fields.map((f) => `${f.name} = ?`), ...(meta.updatedAtColumn ? [`${meta.updatedAtColumn} = ?`] : [])];
        const vals = [...meta.fields.map((f) => toDbValue(f, values[f.name])), ...(meta.updatedAtColumn ? [ts] : []), String(editing[meta.idColumn])];
        await bridge.db.execute(`UPDATE ${meta.table} SET ${sets.join(', ')} WHERE ${meta.idColumn} = ?`, vals);
        toast.add({ title: 'Row updated', type: 'success' });
      }
      setCreating(false);
      setEditing(null);
      await load();
    } catch (err) {
      toast.add({ title: 'Save failed', description: err instanceof Error ? err.message : String(err), type: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function remove(row: Record<string, unknown>): Promise<void> {
    if (!meta) return;
    if (!window.confirm('Delete this row?')) return;
    setBusy(true);
    try {
      await bridge.db.execute(`DELETE FROM ${meta.table} WHERE ${meta.idColumn} = ?`, [String(row[meta.idColumn])]);
      await load();
    } catch (err) {
      toast.add({ title: 'Delete failed', description: err instanceof Error ? err.message : String(err), type: 'error' });
    } finally {
      setBusy(false);
    }
  }

  if (!meta) {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground">Unknown testing model: {modelId}</p>
        <Link href="/settings/testing" className="underline underline-offset-4">← Back to Testing</Link>
      </div>
    );
  }

  const dialogOpen = creating || editing !== null;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <Link href="/settings/testing" className="text-sm text-muted-foreground inline-flex items-center gap-1 hover:text-foreground" data-testid="back-testing">
            <ArrowLeft className="size-3.5" />
            Testing
          </Link>
          <h1 className="text-2xl font-semibold">{meta.label}</h1>
          <p className="text-muted-foreground">{meta.description}</p>
        </div>
        <Button onClick={() => setCreating(true)} data-testid="create-row">
          <Plus className="size-4 mr-1" />
          New
        </Button>
      </div>

      <ModelTable meta={meta} rows={rows} onEdit={(row) => setEditing(row)} onDelete={(row) => void remove(row)} busy={busy} />

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { setCreating(false); setEditing(null); } }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{creating ? `New ${meta.label.replace(/s$/, '')}` : 'Edit row'}</DialogTitle>
          </DialogHeader>
          <ModelForm
            key={creating ? 'new' : String(editing?.[meta.idColumn])}
            meta={meta}
            initial={editing}
            loadOptions={loadOptions}
            onSubmit={save}
            onCancel={() => { setCreating(false); setEditing(null); }}
            busy={busy}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
