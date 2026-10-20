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
import { startAiRealtime, getAiRealtimeClient, type AiRealtimeStatus } from '@/integration/ai-realtime';
import deviceConfig from '@/device.config';
import { Plug, PlugZap, Send } from 'lucide-react';

const STATUS_COLORS: Record<RealtimeStatus, string> = {
  offline: 'bg-muted text-muted-foreground',
  connecting: 'bg-amber-100 text-amber-800',
  connected: 'bg-green-100 text-green-800',
  disconnected: 'bg-muted text-muted-foreground',
  reconnecting: 'bg-amber-100 text-amber-800',
  error: 'bg-red-100 text-red-800',
  failed: 'bg-red-100 text-red-800',
};

const AI_STATUS_COLORS: Record<AiRealtimeStatus, string> = {
  idle: 'bg-muted text-muted-foreground',
  connecting: 'bg-amber-100 text-amber-800',
  connected: 'bg-green-100 text-green-800',
  disconnected: 'bg-muted text-muted-foreground',
  error: 'bg-red-100 text-red-800',
};

export default function RealtimeSettingsPage() {
  const bridge = useBridge();
  const { state, refreshStatus } = useRealtime();
  const [url, setUrl] = useState('');
  const [posId, setPosId] = useState('');
  const [posName, setPosName] = useState('');
  const [busy, setBusy] = useState(false);
  const [aiUrl, setAiUrl] = useState('');
  const [aiToken, setAiToken] = useState('');
  const [aiTopic, setAiTopic] = useState('');
  const [aiStatus, setAiStatus] = useState<AiRealtimeStatus>('idle');
  const [aiEpoch, setAiEpoch] = useState(0);

  // Track the shared AI Realtime client's connection status. Re-runs when the
  // stored credential loads or the client is restarted (Save & Connect).
  useEffect(() => {
    const client = getAiRealtimeClient();
    if (!client) {
      setAiStatus('idle');
      return;
    }
    setAiStatus(client.getStatus());
    return client.onStatus(setAiStatus);
  }, [aiToken, aiEpoch]);

  // Load persisted config from device_settings.
  useEffect(() => {
    void (async () => {
      const storedUrl = await bridge.kv.get<string>('realtime.url');
      const storedId = await bridge.kv.get<string>('realtime.pos_id');
      const storedName = await bridge.kv.get<string>('realtime.pos_name');
      if (storedUrl) setUrl(storedUrl);
      if (storedId) setPosId(storedId);
      if (storedName) setPosName(storedName);
      setAiUrl((await bridge.kv.get<string>('aiRealtime.url')) ?? deviceConfig.aiRealtime.url);
      setAiToken((await bridge.kv.get<string>('aiRealtime.token')) ?? '');
      setAiTopic((await bridge.kv.get<string>('aiRealtime.topic')) ?? deviceConfig.aiRealtime.topic);
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

  async function saveAiRealtime(): Promise<void> {
    if (!aiUrl.trim() || !aiToken.trim()) {
      toast.add({ title: 'Gateway URL and credential are required', type: 'error' });
      return;
    }
    setBusy(true);
    try {
      await bridge.kv.set('aiRealtime.url', aiUrl.trim());
      await bridge.kv.set('aiRealtime.token', aiToken.trim());
      await bridge.kv.set('aiRealtime.topic', aiTopic.trim() || deviceConfig.aiRealtime.topic);
      const client = await startAiRealtime(bridge);
      setAiEpoch((n) => n + 1);
      toast.add({
        title: client ? 'AI Realtime config saved and connected' : 'AI Realtime config saved',
        type: 'success',
      });
    } catch (err) {
      toast.add({ title: err instanceof Error ? err.message : 'Save failed', type: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function sendTestEvent(): Promise<void> {
    const client = getAiRealtimeClient();
    if (!client) {
      toast.add({ title: 'No AI Realtime client running — save a credential first', type: 'error' });
      return;
    }
    if (!client.isConnected()) {
      toast.add({ title: 'Not connected to the gateway yet', type: 'error' });
      return;
    }
    setBusy(true);
    try {
      const result = await client.publish('device.test', {
        deviceId: client.deviceId,
        message: 'Hello from weha-device-framework',
        at: new Date().toISOString(),
      });
      if (result.ok) {
        toast.add({ title: `Test event delivered (eventId ${result.eventId ?? 'n/a'})`, type: 'success' });
      } else {
        toast.add({
          title: `Test event failed: ${result.code}${result.message ? ` — ${result.message}` : ''}`,
          type: 'error',
        });
      }
    } finally {
      setBusy(false);
    }
  }

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

      <Card data-testid="ai-realtime-settings">
        <CardHeader>
          <CardTitle>AI Realtime</CardTitle>
          <CardDescription>
            WEHA AI Realtime gateway (Socket.IO). Publishes device.active, device.heartbeat and
            session events. Requires an application credential (whrt_ token).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Badge className={AI_STATUS_COLORS[aiStatus]}>{aiStatus}</Badge>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ai-rt-url">Gateway URL</Label>
            <Input
              id="ai-rt-url"
              data-testid="ai-realtime-url-input"
              value={aiUrl}
              onChange={(e) => setAiUrl(e.target.value)}
              placeholder="http://localhost:4002"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ai-rt-token">Credential</Label>
            <Input
              id="ai-rt-token"
              type="password"
              data-testid="ai-realtime-token-input"
              value={aiToken}
              onChange={(e) => setAiToken(e.target.value)}
              placeholder="whrt_..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ai-rt-topic">Topic</Label>
            <Input
              id="ai-rt-topic"
              data-testid="ai-realtime-topic-input"
              value={aiTopic}
              onChange={(e) => setAiTopic(e.target.value)}
              placeholder={deviceConfig.aiRealtime.topic}
            />
          </div>

          <div className="flex gap-2">
            <Button
              disabled={busy}
              onClick={() => void saveAiRealtime()}
              data-testid="save-ai-realtime"
            >
              Save & Connect
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void sendTestEvent()}
              data-testid="send-ai-realtime-test"
            >
              <Send className="size-4 mr-2" />
              Send Test Event
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
