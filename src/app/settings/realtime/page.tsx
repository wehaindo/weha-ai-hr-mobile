'use client';

import { useCallback, useEffect, useState } from 'react';
import { useBridge, type RealtimeStatus } from '@/platform';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/components/ui/toast';
import { useRealtime } from '@/integration/realtime/useRealtime';
import { Plug, PlugZap } from 'lucide-react';

const STATUS_COLORS: Record<RealtimeStatus, string> = {
  offline: 'bg-muted text-muted-foreground',
  connecting: 'bg-amber-100 text-amber-800',
  connected: 'bg-green-100 text-green-800',
  disconnected: 'bg-muted text-muted-foreground',
  reconnecting: 'bg-amber-100 text-amber-800',
  error: 'bg-red-100 text-red-800',
  failed: 'bg-red-100 text-red-800',
};

export default function RealtimeSettingsPage() {
  const bridge = useBridge();
  const { state, refreshStatus } = useRealtime();
  const [url, setUrl] = useState('');
  const [posId, setPosId] = useState('');
  const [posName, setPosName] = useState('');
  const [busy, setBusy] = useState(false);

  // Load persisted config from device_settings.
  useEffect(() => {
    void (async () => {
      const storedUrl = await bridge.kv.get<string>('realtime.url');
      const storedId = await bridge.kv.get<string>('realtime.pos_id');
      const storedName = await bridge.kv.get<string>('realtime.pos_name');
      if (storedUrl) setUrl(storedUrl);
      if (storedId) setPosId(storedId);
      if (storedName) setPosName(storedName);
    })();
  }, [bridge]);

  async function save(): Promise<void> {
    if (!url.trim()) {
      toast.add({ title: 'Server URL is required', type: 'error' });
      return;
    }
    setBusy(true);
    try {
      await bridge.kv.set('realtime.url', url.trim());
      await bridge.kv.set('realtime.pos_id', posId.trim() || 'POS-001');
      await bridge.kv.set('realtime.pos_name', posName.trim() || 'Device');
      toast.add({ title: 'Realtime config saved', type: 'success' });
    } catch (err) {
      toast.add({ title: err instanceof Error ? err.message : 'Save failed', type: 'error' });
    } finally {
      setBusy(false);
    }
  }

  const connect = useCallback(async () => {
    if (!url.trim()) {
      toast.add({ title: 'Save a server URL first', type: 'error' });
      return;
    }
    setBusy(true);
    try {
      await bridge.realtime.connect({
        url: url.trim(),
        identity: {
          pos_id: posId.trim() || 'POS-001',
          pos_name: posName.trim() || 'Device',
          version: '1.0.0',
          screen_width: typeof window !== 'undefined' ? window.innerWidth : undefined,
          screen_height: typeof window !== 'undefined' ? window.innerHeight : undefined,
        },
      });
      await refreshStatus();
    } finally {
      setBusy(false);
    }
  }, [bridge, url, posId, posName, refreshStatus]);

  const disconnect = useCallback(async () => {
    await bridge.realtime.disconnect();
    await refreshStatus();
  }, [bridge, refreshStatus]);

  return (
    <div className="space-y-4" data-testid="realtime-settings">
      <Card>
        <CardHeader>
          <CardTitle>Realtime Server</CardTitle>
          <CardDescription>WebSocket channel to a management server (register, heartbeat, events, remote commands)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Badge className={STATUS_COLORS[state.status]}>{state.status}</Badge>
            {state.posId && <span className="text-xs text-muted-foreground">POS: {state.posId}</span>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="rt-url">Server URL</Label>
            <Input id="rt-url" data-testid="realtime-url-input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="ws://localhost:4000/ws" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="rt-pos-id">POS ID</Label>
              <Input id="rt-pos-id" value={posId} onChange={(e) => setPosId(e.target.value)} placeholder="POS-001" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rt-pos-name">POS name</Label>
              <Input id="rt-pos-name" value={posName} onChange={(e) => setPosName(e.target.value)} placeholder="Cashier 01" />
            </div>
          </div>

          <div className="flex gap-2">
            <Button disabled={busy} onClick={() => void save()} data-testid="save-realtime">
              Save
            </Button>
            {state.isConnected ? (
              <Button variant="outline" disabled={busy} onClick={() => void disconnect()} data-testid="disconnect-realtime">
                <PlugZap className="size-4 mr-2" />
                Disconnect
              </Button>
            ) : (
              <Button disabled={busy} onClick={() => void connect()} data-testid="connect-realtime">
                <Plug className="size-4 mr-2" />
                Connect
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
