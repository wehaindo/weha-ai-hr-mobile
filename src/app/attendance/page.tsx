'use client';

// Sample attendance check-in / check-out page — the template a device app copies
// for a punch clock. Demonstrates the three.js capability (lazy-loaded, client-only
// 3D figure) plus a multi-phase punch flow:
//   animation → send to server → "server processing" → result → settle back.
//   • the 3D figure reacts to the phase (reach / think / wave / shake),
//   • the local row is written FIRST (durability), then the punch is sent to a
//     SIMULATED server (src/lib/attendance/mock-server.ts) that surfaces each
//     phase; the outcome is written back to sync_status/server_ref,
//   • the current in/out state is derived from the latest event (computeStatus).
// Gated by the `three` module flag. Rename `sample_attendance` for a real app.

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBridge } from '@/platform';
import { useAuthStore } from '@/stores/auth';
import { generateId } from '@/lib/id';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/components/ui/toast';
import {
  computeStatus,
  lastEvent,
  PHASE_META,
  TERMINAL_HOLD_MS,
  isTerminalPhase,
  type AttendanceAction,
  type AttendanceEvent,
  type AttendanceStatus,
  type PunchPhase,
} from '@/lib/attendance/status';
import { sendPunchSimulated } from '@/lib/attendance/mock-server';
import { Loader2, LogIn, LogOut } from 'lucide-react';

// three.js is ~600KB — keep it out of the startup bundle; only load on this route.
const AttendanceScene = dynamic(() => import('@/components/attendance/attendance-scene'), { ssr: false });

interface AttendanceRow extends AttendanceEvent {
  created_at: string;
  sync_status: string;
  server_ref: string | null;
}

/** Badge styling for a row's persisted sync_status column. */
const SYNC_BADGE: Record<string, string> = {
  synced: 'bg-green-100 text-green-800',
  sending: 'bg-amber-100 text-amber-800',
  processing: 'bg-blue-100 text-blue-800',
  failed: 'bg-red-100 text-red-800',
  pending: 'bg-muted text-muted-foreground',
};

/** Local-day window (00:00 → 24:00) as ISO strings, like the transactions sample. */
function todayWindow(): { fromIso: string; toIso: string } {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { fromIso: start.toISOString(), toIso: end.toISOString() };
}

export default function AttendancePage() {
  const bridge = useBridge();
  const user = useAuthStore((s) => s.user);
  const [events, setEvents] = useState<AttendanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<PunchPhase>('idle');
  const [webglSupported, setWebglSupported] = useState<boolean | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Probe WebGL once on mount — a device without it gets a message, not a blank canvas.
  useEffect(() => {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
      setWebglSupported(!!gl);
    } catch {
      setWebglSupported(false);
    }
  }, []);

  // Clear any pending terminal-hold timer on unmount (avoid state-after-unmount).
  useEffect(() => {
    return () => {
      if (holdTimer.current) clearTimeout(holdTimer.current);
    };
  }, []);

  const load = useCallback(async () => {
    if (!user) return;
    const { fromIso, toIso } = todayWindow();
    const rows = await bridge.db.query<AttendanceRow>(
      `SELECT id, action, recorded_at, user_name, created_at, sync_status, server_ref
         FROM sample_attendance
        WHERE user_id = ? AND recorded_at >= ? AND recorded_at < ?
        ORDER BY recorded_at DESC`,
      [user.id, fromIso, toIso]
    );
    setEvents(rows);
  }, [bridge, user]);

  useEffect(() => {
    void load()
      .catch((err: unknown) => toast.add({ title: err instanceof Error ? err.message : 'Load failed', type: 'error' }))
      .finally(() => setLoading(false));
  }, [load]);

  const status: AttendanceStatus = useMemo(() => computeStatus(events), [events]);
  const last = useMemo(() => lastEvent(events), [events]);
  const checkedIn = status === 'in';

  /** Hold a terminal phase on screen, then settle back to idle. */
  const holdThenIdle = useCallback((next: PunchPhase) => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    if (!isTerminalPhase(next)) return;
    holdTimer.current = setTimeout(() => setPhase('idle'), TERMINAL_HOLD_MS);
  }, []);

  /**
   * Multi-phase punch: write locally first (durability), then send to the server
   * (which surfaces sending → processing), then write the outcome back and settle.
   */
  const record = useCallback(
    async (action: AttendanceAction) => {
      if (!user || phase !== 'idle') return;

      const iso = new Date().toISOString();
      const id = generateId();

      // 1. Local write FIRST — a crash mid-flow still leaves a visible row.
      setPhase('sending');
      try {
        await bridge.db.execute(
          `INSERT INTO sample_attendance (id, user_id, user_name, action, recorded_at, created_at, sync_status)
           VALUES (?, ?, ?, ?, ?, ?, 'sending')`,
          [id, user.id, user.display_name, action, iso, iso]
        );
      } catch (err) {
        setPhase('failed');
        holdThenIdle('failed');
        toast.add({ title: err instanceof Error ? err.message : 'Local save failed', type: 'error' });
        return;
      }

      // 2. Send — the mock drives sending → processing via onPhase.
      try {
        const result = await sendPunchSimulated(
          { id, user_id: user.id, action, recorded_at: iso },
          (p) => setPhase(p)
        );

        // 3a. Server accepted → record the reference, then hold + settle.
        setPhase('synced');
        await bridge.db.execute('UPDATE sample_attendance SET sync_status = ?, server_ref = ? WHERE id = ?', [
          'synced',
          result.serverRef,
          id,
        ]);
        await load();
        holdThenIdle('synced');
        toast.add({
          title: action === 'CHECK_IN' ? 'Checked in' : 'Checked out',
          description: `${new Date(iso).toLocaleTimeString()} · ${result.serverRef}`,
          type: 'success',
        });
      } catch (err) {
        // 3b. Server rejected → mark the row failed (still locally durable), then hold + settle.
        setPhase('failed');
        await bridge.db.execute('UPDATE sample_attendance SET sync_status = ? WHERE id = ?', ['failed', id]);
        await load();
        holdThenIdle('failed');
        toast.add({ title: 'Punch not synced', description: err instanceof Error ? err.message : 'Server error', type: 'error' });
      }
    },
    [bridge, holdThenIdle, load, phase, user]
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6" data-testid="attendance-page">
      <Card>
        <CardHeader>
          <CardTitle>Attendance</CardTitle>
          <CardDescription>
            Sample check-in / check-out with a three.js figure — lazy-loaded, procedural (no model
            assets). Each punch is a row in <code>sample_attendance</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-hidden rounded-lg border bg-muted/20" style={{ height: 320 }}>
            {webglSupported === false ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground" data-testid="attendance-canvas-fallback">
                3D view unavailable (WebGL not supported on this device)
              </div>
            ) : webglSupported === null ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading 3D view…</div>
            ) : (
              <AttendanceScene status={status} phase={phase} />
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Badge className={checkedIn ? 'bg-green-100 text-green-800' : 'bg-muted text-muted-foreground'} data-testid="attendance-status">
                {checkedIn ? 'Checked in' : 'Checked out'}
              </Badge>
              <Badge className={PHASE_META[phase].className} data-testid="attendance-phase">
                {PHASE_META[phase].label}
              </Badge>
              {last && (
                <span className="text-xs text-muted-foreground" data-testid="attendance-last">
                  Last: {last.action === 'CHECK_IN' ? 'in' : 'out'} at{' '}
                  {new Date(last.recorded_at).toLocaleTimeString()}
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <Button disabled={phase !== 'idle' || checkedIn || !user} onClick={() => void record('CHECK_IN')} data-testid="check-in">
                {phase === 'sending' || phase === 'processing' ? (
                  <Loader2 className="size-4 mr-2 animate-spin" />
                ) : (
                  <LogIn className="size-4 mr-2" />
                )}
                Check in
              </Button>
              <Button variant="outline" disabled={phase !== 'idle' || !checkedIn || !user} onClick={() => void record('CHECK_OUT')} data-testid="check-out">
                {phase === 'sending' || phase === 'processing' ? (
                  <Loader2 className="size-4 mr-2 animate-spin" />
                ) : (
                  <LogOut className="size-4 mr-2" />
                )}
                Check out
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Today&apos;s punches</CardTitle>
          <CardDescription>Newest first — {events.length} event{events.length === 1 ? '' : 's'} today</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : events.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="attendance-empty">
              No punches yet today — check in above.
            </p>
          ) : (
            <ul className="divide-y" data-testid="attendance-list">
              {events.map((event) => (
                <li key={event.id} className="flex items-center justify-between gap-3 py-2" data-testid={`attendance-${event.action}`}>
                  <div className="flex min-w-0 items-center gap-2">
                    <Badge variant={event.action === 'CHECK_IN' ? 'default' : 'secondary'}>
                      {event.action === 'CHECK_IN' ? 'IN' : 'OUT'}
                    </Badge>
                    <span className="truncate text-sm text-muted-foreground">{event.user_name ?? '—'}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {event.server_ref && (
                      <span className="font-mono text-[10px] text-muted-foreground" data-testid="attendance-server-ref">
                        {event.server_ref}
                      </span>
                    )}
                    <Badge className={SYNC_BADGE[event.sync_status] ?? 'bg-muted text-muted-foreground'}>
                      {event.sync_status}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{new Date(event.recorded_at).toLocaleTimeString()}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
