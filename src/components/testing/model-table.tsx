'use client';

// Generic, metadata-driven table for a testing model: renders columns, per-column
// sorting, a filter bar (text/select/boolean), and CSV export of the filtered
// rows. Reusable for any registered test model — no per-model code.

import { useMemo, useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowDown, ArrowUp, Download, Pencil, Trash2 } from 'lucide-react';
import { formatMinor, type TestModelMeta } from '@/testing/models';

type Row = Record<string, unknown>;

interface ModelTableProps {
  meta: TestModelMeta;
  rows: Row[];
  onEdit: (row: Row) => void;
  onDelete: (row: Row) => void;
  busy?: boolean;
}

const ALL = '__all__';

function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value);
}

function Cell({ render, value }: { render?: string; value: unknown }) {
  if (render === 'boolean') {
    return <Badge className={value ? 'bg-green-100 text-green-800' : 'bg-muted text-muted-foreground'}>{value ? 'Yes' : 'No'}</Badge>;
  }
  if (render === 'money') return <span className="tabular-nums">{formatMinor(value)}</span>;
  if (render === 'date') {
    const s = cellText(value);
    return <span>{s ? s.slice(0, 10) : ''}</span>;
  }
  if (render === 'badge') {
    return <Badge className="capitalize">{cellText(value)}</Badge>;
  }
  return <span>{cellText(value)}</span>;
}

function toCsv(meta: TestModelMeta, rows: Row[]): string {
  const cols = meta.columns;
  const escape = (v: unknown): string => {
    const s = cellText(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = cols.map((c) => escape(c.label)).join(',');
  const body = rows.map((r) => cols.map((c) => escape(r[c.key])).join(',')).join('\n');
  return `${header}\n${body}`;
}

export default function ModelTable({ meta, rows, onEdit, onDelete, busy }: ModelTableProps) {
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);

  const filtered = useMemo(() => {
    let out = rows;
    for (const f of meta.filters) {
      const v = filters[f.key];
      if (!v || v === ALL) continue;
      out = out.filter((r) => {
        const cell = r[f.key];
        if (f.type === 'text') return cellText(cell).toLowerCase().includes(v.toLowerCase());
        if (f.type === 'boolean') return (cell ? 'true' : 'false') === v;
        return cellText(cell) === v;
      });
    }
    if (sort) {
      const { key, dir } = sort;
      out = [...out].sort((a, b) => {
        const av = a[key];
        const bv = b[key];
        const an = typeof av === 'number';
        const bn = typeof bv === 'number';
        let cmp: number;
        if (an && bn) cmp = (av as number) - (bv as number);
        else cmp = cellText(av).localeCompare(cellText(bv));
        return dir === 'asc' ? cmp : -cmp;
      });
    }
    return out;
  }, [rows, filters, sort, meta]);

  function toggleSort(key: string): void {
    setSort((prev) => (prev?.key !== key ? { key, dir: 'asc' } : prev.dir === 'asc' ? { key, dir: 'desc' } : null));
  }

  function exportCsv(): void {
    const csv = toCsv(meta, filtered);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${meta.id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        {meta.filters.map((f) => (
          <div key={f.key} className="space-y-1">
            <label className="text-xs text-muted-foreground">{f.label}</label>
            {f.type === 'text' ? (
              <Input
                className="h-8 w-40"
                placeholder={`Filter ${f.label.toLowerCase()}`}
                value={filters[f.key] ?? ''}
                onChange={(e) => setFilters((prev) => ({ ...prev, [f.key]: e.target.value }))}
              />
            ) : (
              <Select value={filters[f.key] ?? ALL} onValueChange={(v) => setFilters((prev) => ({ ...prev, [f.key]: v ?? '' }))}>
                <SelectTrigger className="h-8 w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All</SelectItem>
                  {f.type === 'boolean' ? (
                    <>
                      <SelectItem value="true">Yes</SelectItem>
                      <SelectItem value="false">No</SelectItem>
                    </>
                  ) : (
                    f.options?.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)
                  )}
                </SelectContent>
              </Select>
            )}
          </div>
        ))}
        <Button variant="outline" size="sm" className="ml-auto" onClick={exportCsv} data-testid="export-csv">
          <Download className="size-3.5 mr-1" />
          Export CSV
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {meta.columns.map((c) => (
                <TableHead key={c.key}>
                  {c.sortable ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 hover:text-foreground"
                      onClick={() => toggleSort(c.key)}
                      data-testid={`sort-${c.key}`}
                    >
                      {c.label}
                      {sort?.key === c.key && (sort.dir === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
                    </button>
                  ) : (
                    c.label
                  )}
                </TableHead>
              ))}
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={meta.columns.length + 1} className="h-24 text-center text-muted-foreground">
                  No rows. Seed the fixtures or add one.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((row, i) => (
                <TableRow key={String(row[meta.idColumn] ?? i)}>
                  {meta.columns.map((c) => (
                    <TableCell key={c.key}>
                      <Cell render={c.render} value={row[c.key]} />
                    </TableCell>
                  ))}
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" disabled={busy} onClick={() => onEdit(row)} data-testid={`edit-${String(row[meta.idColumn])}`}>
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" className="text-destructive" disabled={busy} onClick={() => onDelete(row)} data-testid={`delete-${String(row[meta.idColumn])}`}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
