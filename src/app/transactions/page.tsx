'use client';

// Sample transaction page — the template a device app copies when it needs to
// record transactions (POS sales, orders, service tickets, …). Demonstrates:
// header + line items saved atomically with bridge.db.batch(), attribution via
// the session user, and a permission-gated nav item (`transactions.use`).
// To push transactions to the cloud/ERP, register an OrderlineSource
// (src/integration/orderline-source.ts) that reads these tables.

import { useCallback, useEffect, useState } from 'react';
import { useBridge } from '@/platform';
import { useAuthStore } from '@/stores/auth';
import { generateId } from '@/lib/id';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import ConfirmDialog from '@/components/ui/confirm-dialog';
import { toast } from '@/components/ui/toast';

interface TransactionRow {
  id: string;
  reference: string;
  status: string;
  customer_name: string | null;
  total: number;
  created_by_name: string | null;
  created_at: string;
}

interface LineRow {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

interface LineDraft {
  key: string;
  description: string;
  quantity: string;
  unitPrice: string;
}

const EMPTY_LINE: LineDraft = { key: '', description: '', quantity: '1', unitPrice: '' };

function newLine(): LineDraft {
  return { ...EMPTY_LINE, key: generateId() };
}

/** Money is stored as INTEGER minor units; the form edits major units. */
function toMinor(major: string): number {
  return Math.round(Number(major.replace(',', '.')) * 100);
}

function formatMinor(minor: number): string {
  return (minor / 100).toFixed(2);
}

function lineTotal(line: LineDraft): number {
  const qty = Math.max(1, Math.floor(Number(line.quantity) || 0));
  return qty * toMinor(line.unitPrice || '0');
}

function referenceFor(now: Date): string {
  const ymd = now.toISOString().slice(0, 10).replace(/-/g, '');
  return `TX-${ymd}-${generateId().slice(0, 4).toUpperCase()}`;
}

export default function TransactionsPage() {
  const bridge = useBridge();
  const currentUser = useAuthStore((s) => s.user);
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([newLine()]);
  const [details, setDetails] = useState<{ transaction: TransactionRow; lines: LineRow[] } | null>(null);
  const [cancelTarget, setCancelTarget] = useState<TransactionRow | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const rows = await bridge.db.query<TransactionRow>(
      `SELECT t.id, t.reference, t.status, t.customer_name, t.total, t.created_at,
              u.display_name AS created_by_name
         FROM sample_transactions t
         LEFT JOIN users u ON u.id = t.created_by
        ORDER BY t.created_at DESC`
    );
    setTransactions(rows);
  }, [bridge]);

  useEffect(() => {
    void load();
  }, [load]);

  const total = lines.reduce((sum, line) => sum + lineTotal(line), 0);

  function updateLine(key: string, patch: Partial<LineDraft>): void {
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  async function saveTransaction(): Promise<void> {
    const validLines = lines.filter((line) => line.description.trim() && toMinor(line.unitPrice || '0') > 0);
    if (validLines.length === 0) {
      toast.add({ title: 'Add at least one line with a description and price', type: 'error' });
      return;
    }

    setBusy(true);
    try {
      const now = new Date();
      const iso = now.toISOString();
      const id = generateId();
      const statements = [
        {
          sql: `INSERT INTO sample_transactions (id, reference, status, customer_name, total, notes, created_by, created_at, updated_at)
                VALUES (?, ?, 'COMPLETED', ?, ?, ?, ?, ?, ?)`,
          params: [
            id,
            referenceFor(now),
            customerName.trim() || null,
            validLines.reduce((sum, line) => sum + lineTotal(line), 0),
            notes.trim() || null,
            currentUser?.id ?? 'unknown',
            iso,
            iso,
          ],
        },
        ...validLines.map((line) => ({
          sql: `INSERT INTO sample_transaction_lines (id, transaction_id, description, quantity, unit_price, line_total, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          params: [
            generateId(),
            id,
            line.description.trim(),
            Math.max(1, Math.floor(Number(line.quantity) || 1)),
            toMinor(line.unitPrice),
            lineTotal(line),
            iso,
            iso,
          ],
        })),
      ];
      await bridge.db.batch(statements);
      toast.add({ title: 'Transaction recorded', type: 'success' });
      setCustomerName('');
      setNotes('');
      setLines([newLine()]);
      await load();
    } catch (err) {
      toast.add({ title: err instanceof Error ? err.message : 'Save failed', type: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function openDetails(transaction: TransactionRow): Promise<void> {
    try {
      const lineRows = await bridge.db.query<LineRow>(
        'SELECT id, description, quantity, unit_price, line_total FROM sample_transaction_lines WHERE transaction_id = ? ORDER BY created_at',
        [transaction.id]
      );
      setDetails({ transaction, lines: lineRows });
    } catch (err) {
      toast.add({ title: err instanceof Error ? err.message : 'Load failed', type: 'error' });
    }
  }

  async function cancelTransaction(): Promise<void> {
    if (!cancelTarget) return;
    setBusy(true);
    try {
      await bridge.db.execute('UPDATE sample_transactions SET status = ?, updated_at = ? WHERE id = ?', [
        'CANCELLED',
        new Date().toISOString(),
        cancelTarget.id,
      ]);
      toast.add({ title: 'Transaction cancelled', type: 'success' });
      setCancelTarget(null);
      await load();
    } catch (err) {
      toast.add({ title: err instanceof Error ? err.message : 'Cancel failed', type: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6" data-testid="transactions-page">
      <Card>
        <CardHeader>
          <CardTitle>New transaction</CardTitle>
          <CardDescription>
            Header and lines are saved atomically with <code>bridge.db.batch()</code> — money is stored
            in minor units
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="tx-customer">Customer (optional)</Label>
              <Input
                id="tx-customer"
                data-testid="tx-customer-input"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tx-notes">Notes (optional)</Label>
              <Input
                id="tx-notes"
                data-testid="tx-notes-input"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            {lines.map((line, index) => (
              <div key={line.key} className="flex items-end gap-2" data-testid={`tx-line-${index}`}>
                <div className="flex-1 space-y-2">
                  <Label htmlFor={`tx-line-desc-${index}`}>Description</Label>
                  <Input
                    id={`tx-line-desc-${index}`}
                    placeholder="Item or service"
                    value={line.description}
                    onChange={(e) => updateLine(line.key, { description: e.target.value })}
                  />
                </div>
                <div className="w-20 space-y-2">
                  <Label htmlFor={`tx-line-qty-${index}`}>Qty</Label>
                  <Input
                    id={`tx-line-qty-${index}`}
                    inputMode="numeric"
                    value={line.quantity}
                    onChange={(e) => updateLine(line.key, { quantity: e.target.value.replace(/\D/g, '') })}
                  />
                </div>
                <div className="w-28 space-y-2">
                  <Label htmlFor={`tx-line-price-${index}`}>Unit price</Label>
                  <Input
                    id={`tx-line-price-${index}`}
                    inputMode="decimal"
                    placeholder="0.00"
                    value={line.unitPrice}
                    onChange={(e) => updateLine(line.key, { unitPrice: e.target.value })}
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Remove line"
                  disabled={lines.length === 1}
                  onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
                >
                  ✕
                </Button>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <Button variant="outline" data-testid="tx-add-line" onClick={() => setLines((prev) => [...prev, newLine()])}>
              Add line
            </Button>
            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="text-lg font-semibold" data-testid="tx-total">
                {formatMinor(total)}
              </span>
              <Button disabled={busy} data-testid="tx-save" onClick={() => void saveTransaction()}>
                {busy ? 'Saving…' : 'Record transaction'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Transactions</CardTitle>
          <CardDescription>Recorded on this device, newest first</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reference</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Recorded by</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="w-36" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                    No transactions yet
                  </TableCell>
                </TableRow>
              )}
              {transactions.map((tx) => (
                <TableRow key={tx.id} data-testid={`tx-row-${tx.reference}`}>
                  <TableCell className="font-mono text-xs">{tx.reference}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(tx.created_at).toLocaleString()}
                  </TableCell>
                  <TableCell>{tx.customer_name ?? '—'}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{tx.created_by_name ?? '—'}</TableCell>
                  <TableCell>
                    {tx.status === 'CANCELLED' ? (
                      <Badge variant="secondary">cancelled</Badge>
                    ) : (
                      <Badge>completed</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-medium">{formatMinor(tx.total)}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" data-testid={`tx-details-${tx.reference}`} onClick={() => void openDetails(tx)}>
                        Details
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        disabled={tx.status === 'CANCELLED' || busy}
                        onClick={() => setCancelTarget(tx)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!details} onOpenChange={(open) => !open && setDetails(null)}>
        <DialogContent className="sm:max-w-lg" data-testid="tx-details-dialog">
          <DialogHeader>
            <DialogTitle className="font-mono text-sm">{details?.transaction.reference}</DialogTitle>
            <DialogDescription>
              {details ? new Date(details.transaction.created_at).toLocaleString() : ''}
            </DialogDescription>
          </DialogHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Unit price</TableHead>
                <TableHead className="text-right">Line total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {details?.lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell>{line.description}</TableCell>
                  <TableCell className="text-right">{line.quantity}</TableCell>
                  <TableCell className="text-right">{formatMinor(line.unit_price)}</TableCell>
                  <TableCell className="text-right font-medium">{formatMinor(line.line_total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <DialogFooter>
            <span className="mr-auto text-sm font-semibold">
              Total {formatMinor(details?.transaction.total ?? 0)}
            </span>
            <Button variant="outline" onClick={() => setDetails(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!cancelTarget}
        onOpenChange={(open) => !open && setCancelTarget(null)}
        title="Cancel transaction?"
        description={cancelTarget ? `${cancelTarget.reference} will be marked as cancelled.` : undefined}
        confirmLabel="Cancel transaction"
        variant="destructive"
        loading={busy}
        onConfirm={() => void cancelTransaction()}
      />
    </div>
  );
}
