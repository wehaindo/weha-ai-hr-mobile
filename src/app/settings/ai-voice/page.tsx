'use client';

// Ai Voice settings — LLM + STT provider config, thresholds, ordering toggles,
// product aliases, and a live test panel (record → transcribe → parse). The
// parsed result is generic `{items, confidence}`; a device app maps it to its cart.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useBridge } from '@/platform';
import { toast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { SettingsCard, SettingsField, SettingsNumberField, SettingsToggle, SettingsSelect, SaveButton } from '@/components/settings/fields';
import { VoiceConfigService, type VoiceConfigRow } from '@/integration/voice/config';
import { transcribe, testSttConnection } from '@/integration/voice/transcribe';
import { parseOrder, testLlmConnection, type ParsedItem } from '@/integration/voice/parse-order';
import { ProductAliasService, type ProductAliasRow } from '@/integration/voice/aliases';
import { Mic, Plug, Trash2 } from 'lucide-react';

export default function AiVoiceSettingsPage() {
  const bridge = useBridge();
  const [configService, setConfigService] = useState<VoiceConfigService | null>(null);
  const [aliasService, setAliasService] = useState<ProductAliasService | null>(null);
  const [config, setConfig] = useState<VoiceConfigRow | null>(null);
  const [aliases, setAliases] = useState<ProductAliasRow[]>([]);
  const [busy, setBusy] = useState(false);

  // Editable local form state.
  const [form, setForm] = useState<Partial<VoiceConfigRow>>({});
  const [aliasName, setAliasName] = useState('');
  const [aliasTarget, setAliasTarget] = useState('');

  // Live test state.
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [items, setItems] = useState<ParsedItem[] | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    setConfigService(new VoiceConfigService(bridge));
    setAliasService(new ProductAliasService(bridge));
  }, [bridge]);

  const load = useCallback(async () => {
    if (!configService || !aliasService) return;
    const cfg = await configService.getConfig();
    setConfig(cfg);
    if (cfg) setForm(cfg);
    setAliases(await aliasService.list());
  }, [configService, aliasService]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSave(): Promise<void> {
    if (!configService) return;
    setBusy(true);
    try {
      // Strip nulls (Partial<VoiceConfigRow> allows null; input wants undefined).
      const cleaned = Object.fromEntries(Object.entries(form).filter(([, v]) => v !== null && v !== undefined));
      const saved = await configService.saveConfig(cleaned);
      setConfig(saved);
      setForm(saved);
      toast.add({ title: 'Voice settings saved', type: 'success' });
    } catch (err) {
      toast.add({ title: err instanceof Error ? err.message : 'Save failed', type: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function testLlm(): Promise<void> {
    if (!configService || !config) return;
    setBusy(true);
    try {
      const result = await testLlmConnection(bridge, config);
      await configService.recordTest(result.ok, result.error);
      toast.add({ title: result.ok ? 'LLM connection OK' : (result.error ?? 'Test failed'), type: result.ok ? 'success' : 'error' });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function testStt(): Promise<void> {
    if (!configService || !config) return;
    setBusy(true);
    try {
      const result = await testSttConnection(bridge, config);
      toast.add({ title: result.ok ? 'STT connection OK' : (result.error ?? 'Test failed'), type: result.ok ? 'success' : 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function addAlias(): Promise<void> {
    if (!aliasService) return;
    try {
      await aliasService.add(aliasName, aliasTarget);
      setAliasName('');
      setAliasTarget('');
      setAliases(await aliasService.list());
    } catch (err) {
      toast.add({ title: err instanceof Error ? err.message : 'Add failed', type: 'error' });
    }
  }

  // Live test: record → transcribe → parse → show generic items.
  async function startRecording(): Promise<void> {
    if (!config) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        void processRecording();
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch (err) {
      toast.add({ title: err instanceof Error ? err.message : 'Microphone unavailable', type: 'error' });
    }
  }

  function stopRecording(): void {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  }

  async function processRecording(): Promise<void> {
    if (!config) return;
    const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
    const bytes = new Uint8Array(await blob.arrayBuffer());

    const tr = await transcribe(bridge, config, bytes, 'audio.webm');
    if (!tr.ok || !tr.text) {
      toast.add({ title: tr.error ?? 'Transcription failed', type: 'error' });
      return;
    }
    setTranscript(tr.text);

    const parsed = await parseOrder(bridge, config, tr.text);
    if (parsed.ok && parsed.items) {
      setItems(parsed.items);
      toast.add({ title: `Parsed ${parsed.items.length} item(s)`, type: 'success' });
    } else {
      toast.add({ title: parsed.error ?? 'Parse failed', type: 'error' });
    }
  }

  return (
    <div className="space-y-4" data-testid="ai-voice-settings">
      <SettingsCard title="LLM provider" description="Model used to parse transcripts into order items">
        <div className="grid gap-4 sm:grid-cols-2">
          <SettingsField label="Base URL" value={form.base_url ?? ''} onChange={(v) => setForm({ ...form, base_url: v })} placeholder="https://api.openai.com/v1" testId="ai-llm-base-url" />
          <SettingsField label="API key" type="password" value={form.api_key ?? ''} onChange={(v) => setForm({ ...form, api_key: v })} testId="ai-llm-api-key" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <SettingsField label="Model" value={form.model ?? ''} onChange={(v) => setForm({ ...form, model: v })} placeholder="gpt-4o-mini" testId="ai-llm-model" />
          <SettingsSelect
            label="Provider"
            value={form.provider ?? 'openai'}
            onChange={(v) => setForm({ ...form, provider: v as VoiceConfigRow['provider'] })}
            options={[
              { value: 'openai', label: 'OpenAI' },
              { value: 'deepseek', label: 'DeepSeek' },
              { value: 'custom', label: 'Custom (OpenAI-compatible)' },
            ]}
            testId="ai-llm-provider"
          />
        </div>
        <Button variant="outline" size="sm" onClick={() => void testLlm()} disabled={busy || !config} data-testid="ai-test-llm">
          <Plug className="size-3 mr-1" />
          Test LLM
        </Button>
      </SettingsCard>

      <SettingsCard title="Speech-to-text" description="Whisper-compatible transcription">
        <div className="grid gap-4 sm:grid-cols-2">
          <SettingsField label="STT API key" type="password" value={form.stt_api_key ?? ''} onChange={(v) => setForm({ ...form, stt_api_key: v })} testId="ai-stt-api-key" />
          <SettingsField label="STT model" value={form.stt_model ?? ''} onChange={(v) => setForm({ ...form, stt_model: v })} placeholder="whisper-1" testId="ai-stt-model" />
        </div>
        <SettingsSelect
          label="STT provider"
          value={form.stt_provider ?? 'openai'}
          onChange={(v) => setForm({ ...form, stt_provider: v as VoiceConfigRow['stt_provider'] })}
          options={[
            { value: 'openai', label: 'OpenAI Whisper' },
            { value: 'webspeech', label: 'Web Speech (browser)' },
            { value: 'auto', label: 'Auto' },
          ]}
          testId="ai-stt-provider"
        />
        <Button variant="outline" size="sm" onClick={() => void testStt()} disabled={busy || !config} data-testid="ai-test-stt">
          <Plug className="size-3 mr-1" />
          Test STT
        </Button>
      </SettingsCard>

      <SettingsCard title="Thresholds & limits" description="Parse confidence and recording bounds">
        <div className="grid gap-4 sm:grid-cols-2">
          <SettingsNumberField label="Confidence threshold" value={form.confidence_threshold ?? 0.9} onChange={(v) => setForm({ ...form, confidence_threshold: v })} min={0} max={1} testId="ai-confidence" />
          <SettingsNumberField label="Confirm threshold" value={form.confirm_threshold ?? 0.7} onChange={(v) => setForm({ ...form, confirm_threshold: v })} min={0} max={1} testId="ai-confirm-threshold" />
          <SettingsNumberField label="Max recording (s)" value={form.max_recording_seconds ?? 15} onChange={(v) => setForm({ ...form, max_recording_seconds: v })} min={1} testId="ai-max-recording" />
        </div>
        <SettingsSelect
          label="Language"
          value={form.language ?? 'auto'}
          onChange={(v) => setForm({ ...form, language: v })}
          options={[
            { value: 'auto', label: 'Auto detect' },
            { value: 'id', label: 'Indonesian' },
            { value: 'en', label: 'English' },
          ]}
          testId="ai-language"
        />
        <SettingsToggle label="Voice ordering enabled" checked={form.enabled === 1} onChange={(v) => setForm({ ...form, enabled: v ? 1 : 0 })} testId="ai-enabled" />
      </SettingsCard>

      <SettingsCard title="Product aliases" description="Map spoken names to catalog targets">
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Alias</Label>
            <Input value={aliasName} onChange={(e) => setAliasName(e.target.value)} placeholder="nasi goreng" className="w-40" data-testid="ai-alias-name" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Target</Label>
            <Input value={aliasTarget} onChange={(e) => setAliasTarget(e.target.value)} placeholder="Nasi Goreng Spesial" className="w-48" data-testid="ai-alias-target" />
          </div>
          <Button size="sm" onClick={() => void addAlias()} data-testid="ai-add-alias">
            Add
          </Button>
        </div>
        {aliases.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {aliases.map((a) => (
              <Badge key={a.id} variant="outline" className="gap-1">
                {a.alias} → {a.target}
                <button
                  className="ml-1 text-muted-foreground hover:text-destructive"
                  onClick={async () => {
                    await aliasService?.remove(a.id);
                    setAliases(await aliasService!.list());
                  }}
                >
                  <Trash2 className="size-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </SettingsCard>

      <SettingsCard title="Live test" description="Record a phrase → transcribe → parse into items">
        <div className="flex items-center gap-2">
          {recording ? (
            <Button variant="destructive" onClick={stopRecording} data-testid="ai-stop-recording">
              <Mic className="size-4 mr-2 animate-pulse" />
              Stop
            </Button>
          ) : (
            <Button onClick={() => void startRecording()} disabled={!config} data-testid="ai-start-recording">
              <Mic className="size-4 mr-2" />
              Record
            </Button>
          )}
        </div>
        {transcript && (
          <div className="rounded-lg border p-3 text-sm">
            <p className="mb-1 text-xs font-medium text-muted-foreground">Transcript</p>
            <p data-testid="ai-transcript">{transcript}</p>
          </div>
        )}
        {items && items.length > 0 && (
          <div className="rounded-lg border p-3 text-sm">
            <p className="mb-1 text-xs font-medium text-muted-foreground">Parsed items</p>
            <ul className="space-y-1" data-testid="ai-parsed-items">
              {items.map((item, i) => (
                <li key={i} className="flex justify-between">
                  <span>
                    {item.quantity}× {item.name}
                  </span>
                  {item.price !== undefined && <span className="text-muted-foreground">{item.price}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </SettingsCard>

      <div className="flex justify-end">
        <SaveButton onSave={() => void handleSave()} busy={busy} testId="save-ai-voice" />
      </div>
    </div>
  );
}
