'use client';

// Attendance controller (BRD FR-02/03/05/07/09): capability × policy matrix,
// GPS/QR capture, queue-backed submission with drain triggers, and the
// confirmation states. In-memory profile/status data is never persisted —
// only the durable capture queue (attendance_queue) lives in SQLite.
// Session expiry → toast + logout + redirect (Phase 2 convention).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useBridge } from '@/platform';
import { useAuthStore } from '@/stores/auth';
import { toast } from '@/components/ui/toast';
import { EssApiError } from '@/integration/ess/core';
import {
  createEssAttendanceApi,
  type AttendanceConfig,
  type AttendanceEventResult,
  type AttendanceStatus,
  type AttendanceWorksite,
  type EssAttendanceApi,
} from '@/integration/ess/attendance';
import { createEssDeviceAdapter, type EssCapability } from '@/lib/platform/ess-device';
import { evaluateLocation, type GeofenceEvaluation } from '@/lib/ess/attendance/geofence';
import { buildGpsSubmission, buildQrSubmission, newAttendanceEvent } from '@/lib/ess/attendance/payload';
import { parseQrPayload } from '@/lib/ess/attendance/qr';
import { createQrSession, QrSessionError, type QrSession } from '@/lib/ess/attendance/qr-session';
import {
  enqueueAttendanceEvent,
  listBetween,
  listPending,
  resetQueuedBackoff,
  retryFailed,
  type AttendanceQueueRow,
} from '@/lib/ess/attendance/queue';
import { drainAttendanceQueue } from '@/lib/ess/attendance/sync';

export type AttendanceMethodChoice = 'GPS' | 'QR';

export type AttendanceConfirmation =
  | { kind: 'recorded'; event: AttendanceEventResult }
  | { kind: 'duplicate'; event: AttendanceEventResult }
  | { kind: 'rejected'; reason: string; server: boolean }
  | { kind: 'pending'; eventId: string; capturedAt: string };

export interface AttendanceCaptureError {
  code: 'permission' | 'timeout' | 'unavailable' | 'accuracy' | 'no_worksite' | 'invalid_qr' | 'unsupported';
  message: string;
}

export interface MethodAvailability {
  available: boolean;
  /** Why the method cannot be used (policy vs device capability). */
  reason?: string;
}

export interface AttendanceReadiness {
  gps: 'ready' | 'unavailable';
  qr: 'ready' | 'unavailable';
  syncPending: boolean;
  pendingCount: number;
}

export interface AttendanceViewData {
  config: AttendanceConfig;
  worksites: AttendanceWorksite[];
  status: AttendanceStatus;
  capabilities: EssCapability[];
  pending: AttendanceQueueRow[];
  localToday: AttendanceQueueRow[];
  readiness: AttendanceReadiness;
}

export type AttendanceState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; data: AttendanceViewData }
  | { status: 'no_session' }
  | { status: 'error'; error: EssApiError };

export interface AttendanceCapture {
  method: AttendanceMethodChoice;
  phase: 'locating' | 'scanning';
  /** GPS only: last evaluation shown while punching (distance/accuracy). */
  evaluation?: GeofenceEvaluation;
}

export interface UseAttendance {
  state: AttendanceState;
  capture: AttendanceCapture | null;
  captureError: AttendanceCaptureError | null;
  confirmation: AttendanceConfirmation | null;
  busy: boolean;
  methodAvailability: Record<AttendanceMethodChoice, MethodAvailability>;
  reload: () => void;
  /** GPS: locate → evaluate → enqueue → drain → confirmation. */
  punchWithGps: () => Promise<void>;
  /** QR: open a camera session on `video`; first valid code submits. */
  startQrScan: (video: HTMLVideoElement) => Promise<void>;
  stopQrScan: () => void;
  retryQueue: () => Promise<void>;
  dismissConfirmation: () => void;
}

interface ServerLoad {
  config: AttendanceConfig;
  worksites: AttendanceWorksite[];
  status: AttendanceStatus;
  capabilities: EssCapability[];
  gpsPermission: 'granted' | 'denied' | 'prompt' | 'unsupported';
}

interface LocalLoad {
  pending: AttendanceQueueRow[];
  localToday: AttendanceQueueRow[];
}

const PENDING_DRAIN_INTERVAL_MS = 30_000;

function todayWindow(): { fromIso: string; toIso: string } {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 1);
  return { fromIso: start.toISOString(), toIso: end.toISOString() };
}

export function useAttendance(): UseAttendance {
  const bridge = useBridge();
  const router = useRouter();
  const session = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const [state, setState] = useState<AttendanceState>({ status: 'idle' });
  const [capture, setCapture] = useState<AttendanceCapture | null>(null);
  const [captureError, setCaptureError] = useState<AttendanceCaptureError | null>(null);
  const [confirmation, setConfirmation] = useState<AttendanceConfirmation | null>(null);
  const [busy, setBusy] = useState(false);
  const [nonce, setNonce] = useState(0);

  const apiRef = useRef<EssAttendanceApi | null>(null);
  const qrSessionRef = useRef<QrSession | null>(null);
  const captureBusyRef = useRef(false);

  const handleSessionExpired = useCallback(() => {
    toast.add({ title: 'Session expired', description: 'Please sign in again.', type: 'warning' });
    logout();
    router.replace('/');
  }, [logout, router]);

  const ensureApi = useCallback(async (): Promise<EssAttendanceApi> => {
    if (!apiRef.current) apiRef.current = await createEssAttendanceApi(bridge);
    return apiRef.current;
  }, [bridge]);

  const loadServer = useCallback(async (): Promise<ServerLoad> => {
    const api = await ensureApi();
    const adapter = createEssDeviceAdapter(bridge);
    const [config, worksites, status, capabilities, gpsPermission] = await Promise.all([
      api.getConfig(),
      api.getWorksites(),
      api.getStatus(),
      adapter.getCapabilities(),
      bridge.location.permission(),
    ]);
    return { config, worksites, status, capabilities, gpsPermission };
  }, [bridge, ensureApi]);

  const loadLocal = useCallback(async (): Promise<LocalLoad> => {
    const window_ = todayWindow();
    const [pending, localToday] = await Promise.all([
      listPending(bridge),
      listBetween(bridge, window_.fromIso, window_.toIso),
    ]);
    return { pending, localToday };
  }, [bridge]);

  const toViewData = useCallback((server: ServerLoad, local: LocalLoad): AttendanceViewData => {
    const gpsOk = server.capabilities.includes('location') && server.gpsPermission !== 'denied' && server.gpsPermission !== 'unsupported';
    const qrOk = server.capabilities.includes('qr-scan');
    return {
      config: server.config,
      worksites: server.worksites,
      status: server.status,
      capabilities: server.capabilities,
      pending: local.pending,
      localToday: local.localToday,
      readiness: {
        gps: gpsOk ? 'ready' : 'unavailable',
        qr: qrOk ? 'ready' : 'unavailable',
        syncPending: local.pending.length > 0,
        pendingCount: local.pending.length,
      },
    };
  }, []);

  const refresh = useCallback(async (): Promise<void> => {
    if (session?.authSource !== 'mobile') return;
    // Local first: queued/rejected punches must appear (and clear) even offline.
    const local = await loadLocal();
    setState((prev) => {
      if (prev.status !== 'ready') return prev;
      return {
        status: 'ready',
        data: {
          ...prev.data,
          ...local,
          readiness: {
            ...prev.data.readiness,
            syncPending: local.pending.length > 0,
            pendingCount: local.pending.length,
          },
        },
      };
    });
    try {
      const server = await loadServer();
      setState((prev) => (prev.status === 'ready' ? { status: 'ready', data: toViewData(server, local) } : prev));
    } catch (err) {
      if (err instanceof EssApiError && err.isSessionExpired) {
        handleSessionExpired();
        return;
      }
      // Offline-tolerant: a network failure keeps the server data already on
      // screen (pending punches stay visible without connectivity).
      if (err instanceof EssApiError && err.isNetwork) return;
      if (err instanceof EssApiError) setState({ status: 'error', error: err });
    }
  }, [handleSessionExpired, loadLocal, loadServer, session?.authSource, toViewData]);

  // Initial load / reload.
  useEffect(() => {
    if (session?.authSource !== 'mobile') {
      setState({ status: 'no_session' });
      return;
    }
    let cancelled = false;
    setState({ status: 'loading' });
    void (async () => {
      try {
        const [server, local] = await Promise.all([loadServer(), loadLocal()]);
        if (!cancelled) setState({ status: 'ready', data: toViewData(server, local) });
      } catch (err) {
        if (cancelled) return;
        if (err instanceof EssApiError && err.isSessionExpired) {
          handleSessionExpired();
          return;
        }
        setState({
          status: 'error',
          error:
            err instanceof EssApiError
              ? err
              : new EssApiError('Failed to load attendance.', 0, 'unavailable'),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [handleSessionExpired, loadLocal, loadServer, nonce, session?.authSource, toViewData]);

  const pendingCount = state.status === 'ready' ? state.data.readiness.pendingCount : 0;

  /** Drain the queue (after punch / on trigger) and refresh server-facing state. */
  const runDrain = useCallback(async (): Promise<void> => {
    const api = await ensureApi();
    const result = await drainAttendanceQueue(bridge, api);
    if (result.sessionExpired) {
      handleSessionExpired();
      return;
    }
    await refresh();
  }, [bridge, ensureApi, handleSessionExpired, refresh]);

  // Triggers: reconnect (fresh immediate retry) + a 30s cadence while pending.
  useEffect(() => {
    if (session?.authSource !== 'mobile' || pendingCount === 0) return;
    const drain = () => {
      void runDrain().catch(() => {
        /* next trigger retries */
      });
    };
    const onOnline = () => {
      void resetQueuedBackoff(bridge)
        .then(drain)
        .catch(() => {
          /* next trigger retries */
        });
    };
    window.addEventListener('online', onOnline);
    const timer = setInterval(drain, PENDING_DRAIN_INTERVAL_MS);
    return () => {
      window.removeEventListener('online', onOnline);
      clearInterval(timer);
    };
  }, [bridge, pendingCount, runDrain, session?.authSource]);

  const methodAvailability = useMemo<Record<AttendanceMethodChoice, MethodAvailability>>(() => {
    if (state.status !== 'ready') {
      return { GPS: { available: false }, QR: { available: false } };
    }
    const { config, capabilities } = state.data;
    const gpsAllowed = config.methods.includes('GPS');
    const qrAllowed = config.methods.includes('QR');
    const gpsDevice = capabilities.includes('location');
    const qrDevice = capabilities.includes('qr-scan');
    return {
      GPS: {
        available: gpsAllowed && gpsDevice && state.data.readiness.gps === 'ready',
        reason: !gpsAllowed ? 'Not enabled by company policy' : !gpsDevice || state.data.readiness.gps !== 'ready' ? 'Location unavailable or permission denied' : undefined,
      },
      QR: {
        available: qrAllowed && qrDevice,
        reason: !qrAllowed ? 'Not enabled by company policy' : !qrDevice ? 'Camera not available on this device' : undefined,
      },
    };
  }, [state]);

  /** Submit a captured event: enqueue (durable) → drain → confirmation. */
  const submitCapture = useCallback(
    async (
      method: AttendanceMethodChoice,
      args:
        | {
            method: 'GPS';
            fix: { latitude: number; longitude: number; accuracyMeters: number; capturedAt: string };
            worksite: AttendanceWorksite;
            evaluation: GeofenceEvaluation;
          }
        | { method: 'QR'; payload: string }
    ): Promise<void> => {
      if (state.status !== 'ready') return;
      const api = await ensureApi();
      const identity = newAttendanceEvent(
        args.method === 'GPS' ? args.fix.capturedAt : new Date().toISOString()
      );

      // Client-side policy rejection: record locally, never submit (FR-07).
      if (args.method === 'GPS' && args.evaluation.verdict === 'reject') {
        await enqueueAttendanceEvent(bridge, {
          id: identity.eventId,
          employeeId: session?.id ?? 'unknown',
          method: 'GPS',
          payload: JSON.stringify(buildGpsSubmission(identity, args)),
          idempotencyKey: identity.idempotencyKey,
          capturedAt: identity.capturedAt,
          status: 'rejected',
          rejectionReason: args.evaluation.reason,
        });
        setConfirmation({ kind: 'rejected', reason: args.evaluation.reason, server: false });
        await refresh();
        return;
      }

      const submission =
        args.method === 'GPS'
          ? buildGpsSubmission(identity, args)
          : buildQrSubmission(identity, { payload: args.payload });

      const { row } = await enqueueAttendanceEvent(bridge, {
        id: identity.eventId,
        employeeId: session?.id ?? 'unknown',
        method,
        payload: JSON.stringify(submission),
        idempotencyKey: identity.idempotencyKey,
        capturedAt: identity.capturedAt,
      });

      const result = await drainAttendanceQueue(bridge, api);
      if (result.sessionExpired) {
        handleSessionExpired();
        return;
      }

      const server = result.results[identity.eventId];
      if (server) {
        if (server.status === 'ACCEPTED') setConfirmation({ kind: 'recorded', event: server });
        else if (server.status === 'DUPLICATE') setConfirmation({ kind: 'duplicate', event: server });
        else setConfirmation({ kind: 'rejected', reason: server.rejectionReason ?? 'rejected', server: true });
      } else {
        setConfirmation({ kind: 'pending', eventId: row.id, capturedAt: identity.capturedAt });
      }
      await refresh();
    },
    [bridge, ensureApi, handleSessionExpired, refresh, session?.id, state.status]
  );

  const punchWithGps = useCallback(async (): Promise<void> => {
    if (captureBusyRef.current || state.status !== 'ready') return;
    const data = state.data;
    captureBusyRef.current = true;
    setBusy(true);
    setCaptureError(null);
    setConfirmation(null);
    setCapture({ method: 'GPS', phase: 'locating' });

    try {
      if (!data.config.policy.offlineAllowed && typeof navigator !== 'undefined' && navigator.onLine === false) {
        setCaptureError({ code: 'unavailable', message: 'Offline attendance is not enabled. Reconnect and try again.' });
        return;
      }

      const worksite = data.worksites.find((w) => w.isPrimary) ?? data.worksites.find((w) => w.isActive !== false);
      if (!worksite) {
        setCaptureError({ code: 'no_worksite', message: 'No worksite is assigned to you. Contact HR.' });
        return;
      }

      let fix;
      try {
        fix = await bridge.location.getCurrent();
      } catch (err) {
        const code = err instanceof Error ? err.message : '';
        setCaptureError(
          code === 'permission_denied'
            ? { code: 'permission', message: 'Location permission is denied. Allow location access in your browser settings, or use QR.' }
            : code === 'timeout'
              ? { code: 'timeout', message: 'Location timed out. Move to an open area and try again.' }
              : { code: 'unavailable', message: 'Could not get your location. Try again.' }
        );
        return;
      }

      const evaluation = evaluateLocation(fix, worksite, {
        geofencePolicy: data.config.policy.geofencePolicy,
      });
      setCapture({ method: 'GPS', phase: 'locating', evaluation });

      if (evaluation.verdict === 'retry_accuracy') {
        setCaptureError({
          code: 'accuracy',
          message: `GPS accuracy too low (±${Math.round(fix.accuracyMeters)}m, max ${worksite.maxAccuracyMeters}m). Move to open sky and retry.`,
        });
        return;
      }

      await submitCapture('GPS', { method: 'GPS', fix, worksite, evaluation });
    } catch (err) {
      if (err instanceof EssApiError && err.isSessionExpired) {
        handleSessionExpired();
        return;
      }
      toast.add({
        title: 'Attendance failed',
        description: err instanceof Error ? err.message : 'Please try again.',
        type: 'error',
      });
    } finally {
      captureBusyRef.current = false;
      setBusy(false);
      setCapture(null);
    }
  }, [bridge, handleSessionExpired, state, submitCapture]);

  const stopQrScan = useCallback(() => {
    qrSessionRef.current?.stop();
    qrSessionRef.current = null;
    setCapture((c) => (c?.method === 'QR' ? null : c));
  }, []);

  const startQrScan = useCallback(
    async (video: HTMLVideoElement): Promise<void> => {
      if (captureBusyRef.current || state.status !== 'ready') return;
      setCaptureError(null);
      setConfirmation(null);

      try {
        const session_ = await createQrSession(video, {
          onText: (text) => {
            const payload = parseQrPayload(text);
            if (!payload) {
              // FR-08: invalid code → explain, keep scanning for a retry.
              setCaptureError({
                code: 'invalid_qr',
                message: 'That is not a valid attendance code. Scan the worksite QR code.',
              });
              return;
            }
            stopQrScan();
            captureBusyRef.current = true;
            setBusy(true);
            void submitCapture('QR', { method: 'QR', payload })
              .catch((err: unknown) => {
                if (err instanceof EssApiError && err.isSessionExpired) {
                  handleSessionExpired();
                  return;
                }
                toast.add({
                  title: 'Attendance failed',
                  description: err instanceof Error ? err.message : 'Please try again.',
                  type: 'error',
                });
              })
              .finally(() => {
                captureBusyRef.current = false;
                setBusy(false);
                setCapture(null);
              });
          },
        });
        qrSessionRef.current = session_;
        setCapture({ method: 'QR', phase: 'scanning' });
      } catch (err) {
        setCapture(null);
        if (err instanceof QrSessionError) {
          setCaptureError({
            code: err.code === 'permission_denied' ? 'permission' : err.code === 'not_supported' ? 'unsupported' : 'unavailable',
            message:
              err.code === 'permission_denied'
                ? 'Camera permission is denied. Allow camera access in your browser settings, or use GPS.'
                : err.code === 'not_supported'
                  ? 'Camera capture is not available on this device.'
                  : 'Could not start the camera. It may be in use by another app.',
          });
          return;
        }
        setCaptureError({ code: 'unavailable', message: 'Could not start the camera.' });
      }
    },
    [handleSessionExpired, state.status, stopQrScan, submitCapture]
  );

  const retryQueue = useCallback(async (): Promise<void> => {
    setBusy(true);
    try {
      await retryFailed(bridge);
      await runDrain();
    } catch (err) {
      if (err instanceof EssApiError && err.isSessionExpired) {
        handleSessionExpired();
        return;
      }
      toast.add({ title: 'Retry failed', description: 'Please try again.', type: 'error' });
    } finally {
      setBusy(false);
    }
  }, [bridge, handleSessionExpired, runDrain]);

  const reload = useCallback(() => {
    setConfirmation(null);
    setCaptureError(null);
    setNonce((n) => n + 1);
  }, []);

  const dismissConfirmation = useCallback(() => setConfirmation(null), []);

  // Release the camera on unmount / route change (FR-04).
  useEffect(() => () => stopQrScan(), [stopQrScan]);

  return {
    state,
    capture,
    captureError,
    confirmation,
    busy,
    methodAvailability,
    reload,
    punchWithGps,
    startQrScan,
    stopQrScan,
    retryQueue,
    dismissConfirmation,
  };
}
