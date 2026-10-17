'use client';

import { useCallback, useEffect, useState } from 'react';
import { useBridge } from '@/platform';
import { PrintService, type PrinterProfile, type PrinterConnectionType } from '@/lib/print';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/components/ui/toast';

interface ProfileFormState {
  id?: string;
  name: string;
  connection_type: PrinterConnectionType;
  target: string;
  width_mm: number;
  is_default: boolean;
}

const EMPTY_FORM: ProfileFormState = {
  name: '',
  connection_type: 'tcp',
  target: '',
  width_mm: 80,
  is_default: false,
};

export default function PrintersSettingsPage() {
  const bridge = useBridge();
  const [service, setService] = useState<PrintService | null>(null);
  const [profiles, setProfiles] = useState<PrinterProfile[]>([]);
  const [form, setForm] = useState<ProfileFormState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setService(new PrintService(bridge));
  }, [bridge]);

  const load = useCallback(async () => {
    if (!service) return;
    setProfiles(await service.listProfiles());
  }, [service]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveProfile(): Promise<void> {
    if (!form || !service) return;
    if (!form.name.trim() || !form.target.trim()) {
      toast.add({ title: 'Name and target are required', type: 'error' });
      return;
    }
    setBusy(true);
    try {
      await service.createProfile({
        name: form.name.trim(),
        connection_type: form.connection_type,
        target: form.target.trim(),
        width_mm: form.width_mm,
        is_default: form.is_default,
      });
      toast.add({ title: 'Printer added', type: 'success' });
      setForm(null);
      await load();
    } catch (err) {
      toast.add({ title: err instanceof Error ? err.message : 'Save failed', type: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function testPrint(profile?: PrinterProfile): Promise<void> {
    if (!service) return;
    setBusy(true);
    try {
      await service.testPrint(profile?.id);
      toast.add({ title: 'Test page sent', type: 'success' });
    } catch (err) {
      toast.add({
        title: 'Test print failed',
        description: err instanceof Error ? err.message : String(err),
        type: 'error',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4" data-testid="printers-settings">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Printers</CardTitle>
            <CardDescription>
              Network printers (raw TCP, e.g. 192.168.1.50:9100) or Windows driver printers
            </CardDescription>
          </div>
          <Button data-testid="add-printer" onClick={() => setForm({ ...EMPTY_FORM })}>
            Add printer
          </Button>
        </CardHeader>
        <CardContent>
          {profiles.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No printers configured yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Width</TableHead>
                  <TableHead className="w-40" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {profiles.map((profile) => (
                  <TableRow key={profile.id} data-testid={`printer-row-${profile.name.toLowerCase().replace(/\s+/g, '-')}`}>
                    <TableCell className="font-medium">
                      {profile.name}
                      {profile.is_default === 1 && (
                        <Badge className="ml-2">default</Badge>
                      )}
                    </TableCell>
                    <TableCell className="uppercase">{profile.connection_type}</TableCell>
                    <TableCell className="font-mono text-xs">{profile.target}</TableCell>
                    <TableCell>{profile.width_mm}mm</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() => void testPrint(profile)}
                          data-testid={`test-print-${profile.id}`}
                        >
                          Test
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          disabled={busy}
                          onClick={async () => {
                            await service?.deleteProfile(profile.id);
                            await load();
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!form} onOpenChange={(open) => !open && setForm(null)}>
        <DialogContent className="sm:max-w-sm" data-testid="printer-form-dialog">
          <DialogHeader>
            <DialogTitle>Add printer</DialogTitle>
          </DialogHeader>
          {form && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="printer-name">Name</Label>
                <Input
                  id="printer-name"
                  data-testid="printer-name-input"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Counter printer"
                />
              </div>
              <div className="space-y-2">
                <Label>Connection</Label>
                <Select
                  value={form.connection_type}
                  onValueChange={(value) => setForm({ ...form, connection_type: value as PrinterConnectionType })}
                >
                  <SelectTrigger data-testid="printer-type-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tcp">Network (raw TCP)</SelectItem>
                    <SelectItem value="driver">Windows printer driver</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="printer-target">{form.connection_type === 'tcp' ? 'Host:port' : 'Printer name'}</Label>
                <Input
                  id="printer-target"
                  data-testid="printer-target-input"
                  value={form.target}
                  onChange={(e) => setForm({ ...form, target: e.target.value })}
                  placeholder={form.connection_type === 'tcp' ? '192.168.1.50:9100' : 'POS-PRINTER'}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="printer-width">Paper width (mm)</Label>
                <Select
                  value={String(form.width_mm)}
                  onValueChange={(value) => setForm({ ...form, width_mm: Number(value) })}
                >
                  <SelectTrigger id="printer-width">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="58">58mm</SelectItem>
                    <SelectItem value="80">80mm</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.is_default}
                  onChange={(e) => setForm({ ...form, is_default: e.target.checked })}
                />
                Default printer
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>
              Cancel
            </Button>
            <Button disabled={busy} onClick={() => void saveProfile()} data-testid="save-printer">
              {busy ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
