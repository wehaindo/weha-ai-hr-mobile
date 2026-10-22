'use client';

import { useCallback, useEffect, useState } from 'react';
import { useBridge } from '@/platform';
import { HardwareService, resolveTarget } from '@/lib/hardware/hardware-manager';
import { EcrService } from '@/lib/ecr/ecr-manager';
import { PrintService, buildEscPosBytes, buildTestReceiptContent } from '@/lib/print';
import type { HardwareDevice, HardwareDeviceType, HardwareConnectionType } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/toast';
import { Plug, Radar, Star, Trash2 } from 'lucide-react';
import PrintQueuePanel from '@/components/print/PrintQueuePanel';

const DEVICE_TYPES: { value: HardwareDeviceType; label: string }[] = [
  { value: 'receipt_printer', label: 'Receipt printer' },
  { value: 'kitchen_printer', label: 'Kitchen printer' },
  { value: 'label_printer', label: 'Label printer' },
  { value: 'cash_drawer', label: 'Cash drawer' },
  { value: 'scanner', label: 'Scanner' },
  { value: 'payment_terminal', label: 'Payment terminal (ECR/EDC)' },
  { value: 'customer_display', label: 'Customer display' },
  { value: 'other', label: 'Other' },
];

const CONNECTION_TYPES: { value: HardwareConnectionType; label: string }[] = [
  { value: 'network', label: 'Network (TCP)' },
  { value: 'usb', label: 'USB (Windows driver)' },
  { value: 'serial', label: 'Serial / Bluetooth' },
];

const BANKS: { value: string; label: string }[] = [
  { value: 'generic', label: 'Generic' },
  { value: 'bca', label: 'BCA' },
  { value: 'mandiri', label: 'Mandiri' },
  { value: 'niaga', label: 'Niaga' },
];

interface DeviceFormState {
  id?: string;
  name: string;
  type: HardwareDeviceType;
  connection_type: HardwareConnectionType;
  // network
  ip: string;
  port: number;
  // usb
  system_name: string;
  // serial
  port_path: string;
  baud_rate: number;
  paper_width: number;
  // payment terminal
  bank: string;
  is_default: boolean;
}

const EMPTY_FORM: DeviceFormState = {
  name: '',
  type: 'receipt_printer',
  connection_type: 'network',
  ip: '',
  port: 9100,
  system_name: '',
  port_path: '',
  baud_rate: 9600,
  paper_width: 80,
  bank: 'generic',
  is_default: false,
};

function formFromDevice(device: HardwareDevice): DeviceFormState {
  let config: Record<string, unknown> = {};
  try {
    config = JSON.parse(device.connection_config || '{}');
  } catch {
    config = {};
  }
  return {
    id: device.id,
    name: device.name,
    type: device.type,
    connection_type: device.connection_type,
    ip: (config.ip as string) || '',
    port: (config.port as number) || 9100,
    system_name: (config.system_name as string) || '',
    port_path: (config.port_path as string) || '',
    baud_rate: (config.baud_rate as number) || 9600,
    paper_width: (config.paper_width as number) || 80,
    bank: (config.bank as string) || 'generic',
    is_default: device.is_default === 1,
  };
}

function configFromForm(form: DeviceFormState): Record<string, unknown> {
  if (form.connection_type === 'network') {
    return { ip: form.ip, port: form.port, paper_width: form.paper_width, bank: form.bank };
  }
  if (form.connection_type === 'usb') return { system_name: form.system_name, paper_width: form.paper_width, bank: form.bank };
  return { port_path: form.port_path, baud_rate: form.baud_rate, paper_width: form.paper_width, bank: form.bank };
}

export default function HardwareSettingsPage() {
  const bridge = useBridge();
  const [service, setService] = useState<HardwareService | null>(null);
  const [printService, setPrintService] = useState<PrintService | null>(null);
  const [devices, setDevices] = useState<HardwareDevice[]>([]);
  const [form, setForm] = useState<DeviceFormState | null>(null);
  const [busy, setBusy] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [discovered, setDiscovered] = useState<Awaited<ReturnType<HardwareService['discover']>>>([]);

  useEffect(() => {
    setService(new HardwareService(bridge));
    setPrintService(new PrintService(bridge));
  }, [bridge]);

  const load = useCallback(async () => {
    if (!service) return;
    setDevices(await service.list());
  }, [service]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveDevice(): Promise<void> {
    if (!form || !service) return;
    if (!form.name.trim()) {
      toast.add({ title: 'Name is required', type: 'error' });
      return;
    }
    setBusy(true);
    try {
      const input = {
        name: form.name.trim(),
        type: form.type,
        connection_type: form.connection_type,
        connection_config: configFromForm(form),
        is_default: form.is_default,
      };
      if (form.id) {
        await service.update(form.id, input);
        if (form.is_default) await service.setDefault(form.id);
        toast.add({ title: 'Device updated', type: 'success' });
      } else {
        await service.create(input);
        toast.add({ title: 'Device added', type: 'success' });
      }
      setForm(null);
      await load();
    } catch (err) {
      toast.add({ title: err instanceof Error ? err.message : 'Save failed', type: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function testDevice(device: HardwareDevice): Promise<void> {
    if (!service) return;
    setBusy(true);
    try {
      // Payment terminals use the ECR protocol (status packet) rather than a
      // bare connectivity probe.
      if (device.type === 'payment_terminal') {
        const ecr = new EcrService(bridge);
        const result = await ecr.getStatus({ terminal_id: device.id });
        toast.add({
          title: result.success ? `${device.name}: terminal reachable` : `${device.name}: failed`,
          description: result.error ?? `${result.bank ?? ''} ${result.terminal_name ?? ''}`.trim(),
          type: result.success ? 'success' : 'error',
        });
      } else {
        const result = await service.test(device.id);
        toast.add({
          title: result.ok ? `${device.name}: online` : `${device.name}: failed`,
          description: result.message,
          type: result.ok ? 'success' : 'error',
        });
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  /** Send a test page directly to a printer device (one-click). */
  async function testPrintDevice(device: HardwareDevice): Promise<void> {
    if (!printService) return;
    setBusy(true);
    try {
      const bytes = buildEscPosBytes(buildTestReceiptContent(device.name, 80));
      await printService.printToDevice(device.id, 'test_page', bytes);
      toast.add({ title: `Test page sent to ${device.name}`, type: 'success' });
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

  async function discover(): Promise<void> {
    if (!service) return;
    setDiscovering(true);
    try {
      const found = await service.discover();
      setDiscovered(found);
      toast.add({ title: `Found ${found.length} device(s)`, type: 'default' });
    } catch (err) {
      toast.add({ title: err instanceof Error ? err.message : 'Discovery failed', type: 'error' });
    } finally {
      setDiscovering(false);
    }
  }

  return (
    <div className="space-y-4" data-testid="hardware-settings">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Hardware Devices</CardTitle>
            <CardDescription>Printers, cash drawers, scanners and displays attached to this device</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void discover()} disabled={discovering} data-testid="discover-hardware">
              <Radar className="size-4 mr-2" />
              {discovering ? 'Discovering…' : 'Discover'}
            </Button>
            <Button onClick={() => setForm({ ...EMPTY_FORM })} data-testid="add-hardware">
              Add device
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {devices.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No hardware devices configured yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Connection</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-56" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {devices.map((device) => (
                  <TableRow key={device.id} data-testid={`device-row-${device.id}`}>
                    <TableCell className="font-medium">
                      {device.name}
                      {device.is_default === 1 && <Badge className="ml-2">default</Badge>}
                    </TableCell>
                    <TableCell className="capitalize">{device.type.replace(/_/g, ' ')}</TableCell>
                    <TableCell className="uppercase">{device.connection_type}</TableCell>
                    <TableCell className="font-mono text-xs">{safeTarget(device)}</TableCell>
                    <TableCell>
                      <Badge
                        className={
                          device.status === 'online'
                            ? 'bg-green-100 text-green-800'
                            : device.status === 'error'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-muted text-muted-foreground'
                        }
                      >
                        {device.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" disabled={busy} onClick={() => void testDevice(device)} data-testid={`test-device-${device.id}`}>
                          <Plug className="size-3.5 mr-1" />
                          Test
                        </Button>
                        {device.type.endsWith('_printer') && (
                          <Button variant="ghost" size="sm" disabled={busy} onClick={() => void testPrintDevice(device)} data-testid={`test-print-${device.id}`}>
                            Print
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" disabled={busy} onClick={() => service && void service.setDefault(device.id).then(load)}>
                          <Star className="size-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setForm(formFromDevice(device))}>
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          disabled={busy}
                          onClick={async () => {
                            await service?.remove(device.id);
                            await load();
                          }}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {discovered.length > 0 && (
            <div className="mt-4 rounded-lg border p-3">
              <p className="mb-2 text-sm font-medium">Discovered ({discovered.length})</p>
              <div className="max-h-40 space-y-1 overflow-auto">
                {discovered.map((d, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="font-mono">{d.name}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6"
                      onClick={() => {
                        setForm({
                          ...EMPTY_FORM,
                          name: d.name,
                          connection_type: d.port_path ? 'serial' : 'usb',
                          port_path: d.port_path ?? '',
                          system_name: d.system_name ?? '',
                        });
                        setDiscovered([]);
                      }}
                    >
                      Use
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <PrintQueuePanel />

      <Dialog open={!!form} onOpenChange={(open) => !open && setForm(null)}>
        <DialogContent className="sm:max-w-md" data-testid="hardware-form-dialog">
          <DialogHeader>
            <DialogTitle>{form?.id ? 'Edit device' : 'Add device'}</DialogTitle>
          </DialogHeader>
          {form && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="device-name">Name</Label>
                <Input id="device-name" data-testid="device-name-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Counter printer" />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as HardwareDeviceType })}>
                  <SelectTrigger data-testid="device-type-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DEVICE_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Connection</Label>
                <Select value={form.connection_type} onValueChange={(v) => setForm({ ...form, connection_type: v as HardwareConnectionType })}>
                  <SelectTrigger data-testid="device-connection-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONNECTION_TYPES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {form.connection_type === 'network' && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="device-ip">Host</Label>
                    <Input id="device-ip" data-testid="device-ip-input" value={form.ip} onChange={(e) => setForm({ ...form, ip: e.target.value })} placeholder="192.168.1.50" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="device-port">Port</Label>
                    <Input id="device-port" type="number" value={form.port} onChange={(e) => setForm({ ...form, port: Number(e.target.value) })} />
                  </div>
                </div>
              )}

              {form.connection_type === 'usb' && (
                <div className="space-y-2">
                  <Label htmlFor="device-system-name">Printer name (Windows)</Label>
                  <Input id="device-system-name" value={form.system_name} onChange={(e) => setForm({ ...form, system_name: e.target.value })} placeholder="POS-PRINTER" />
                </div>
              )}

              {form.connection_type === 'serial' && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="device-port-path">Port</Label>
                    <Input id="device-port-path" value={form.port_path} onChange={(e) => setForm({ ...form, port_path: e.target.value })} placeholder="COM3" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="device-baud">Baud</Label>
                    <Input id="device-baud" type="number" value={form.baud_rate} onChange={(e) => setForm({ ...form, baud_rate: Number(e.target.value) })} />
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="device-paper">Paper width (mm)</Label>
                <Select value={String(form.paper_width)} onValueChange={(v) => setForm({ ...form, paper_width: Number(v) })}>
                  <SelectTrigger id="device-paper">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="58">58mm</SelectItem>
                    <SelectItem value="80">80mm</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {form.type === 'payment_terminal' && (
                <div className="space-y-2">
                  <Label>Bank protocol</Label>
                  <Select value={form.bank} onValueChange={(v) => v && setForm({ ...form, bank: v })}>
                    <SelectTrigger data-testid="bank-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BANKS.map((b) => (
                        <SelectItem key={b.value} value={b.value}>
                          {b.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.is_default} onChange={(e) => setForm({ ...form, is_default: e.target.checked })} />
                Default for this type
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>
              Cancel
            </Button>
            <Button disabled={busy} onClick={() => void saveDevice()} data-testid="save-hardware">
              {busy ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function safeTarget(device: HardwareDevice): string {
  try {
    return resolveTarget(device);
  } catch {
    return '—';
  }
}
