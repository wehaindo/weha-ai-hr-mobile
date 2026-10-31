// ESS attendance client — `/api/mobile/v1/attendance/*` via the shared core
// (docs/ESS-ATTENDANCE-CONTRACT.md). Server-authoritative: the client never
// sends an employee id, `status`, or `attendanceType`; `Idempotency-Key`
// carries the captured event id so retries are safe (BRD FR-06).

import { z } from 'zod';
import type { DeviceBridge } from '@/platform';
import { createMobileAuthClient, type MobileAuthClient } from '@/integration/mobile-auth/client';
import { createEssCore, EssApiError } from './core';

export { EssApiError } from './core';

export const ATTENDANCE_METHODS = ['GPS', 'QR'] as const;
export type AttendanceMethod = (typeof ATTENDANCE_METHODS)[number] | 'RFID' | 'FINGERPRINT';

export type AttendanceEventType = 'CHECK_IN' | 'CHECK_OUT';
export type AttendanceResultStatus = 'ACCEPTED' | 'REJECTED' | 'DUPLICATE';

/** Decimal columns may serialize as strings — coerce everywhere. */
const latLng = z.coerce.number().min(-180).max(180);
const meters = z.coerce.number().min(0);

export const attendanceEventResultSchema = z.object({
  id: z.string(),
  /** Null when the server rejects before assigning a type (e.g. duplicate_interval). */
  attendanceType: z.enum(['CHECK_IN', 'CHECK_OUT']).nullable(),
  method: z.string(),
  status: z.enum(['ACCEPTED', 'REJECTED', 'DUPLICATE']),
  /** Server time the punch counts from; null when REJECTED. */
  recordedAt: z.string().nullable().optional(),
  receivedAt: z.string().nullable().optional(),
  worksite: z.object({ id: z.string(), name: z.string() }).nullable().optional(),
  distanceMeters: meters.nullable().optional(),
  rejectionReason: z.string().nullable().optional(),
  duplicateOfEventId: z.string().nullable().optional(),
});

export type AttendanceEventResult = z.infer<typeof attendanceEventResultSchema>;

export const attendanceConfigSchema = z.object({
  methods: z.array(z.enum(['GPS', 'QR', 'RFID', 'FINGERPRINT'])),
  policy: z.object({
    duplicateIntervalSeconds: z.coerce.number(),
    offlineAllowed: z.boolean(),
    // ALLOW: passed through by weha-ai-hrd (raw env value) — same behaviour
    // as EXCEPTION on the server; tolerated so the config never fails to parse.
    geofencePolicy: z.enum(['REJECT', 'EXCEPTION', 'ALLOW']),
    maxAccuracyMeters: z.coerce.number(),
    lateSyncHours: z.coerce.number().optional(),
  }),
  serverTime: z.string().optional(),
});

export type AttendanceConfig = z.infer<typeof attendanceConfigSchema>;

export const attendanceWorksiteSchema = z.object({
  id: z.string(),
  name: z.string(),
  storeId: z.string().nullable().optional(),
  latitude: latLng,
  longitude: latLng,
  radiusMeters: meters,
  maxAccuracyMeters: meters,
  qrEnabled: z.boolean().optional(),
  isPrimary: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export type AttendanceWorksite = z.infer<typeof attendanceWorksiteSchema>;

export const attendanceStatusSchema = z.object({
  current: z.enum(['NOT_STARTED', 'PRESENT', 'FINISHED']),
  expectedNext: z.enum(['CHECK_IN', 'CHECK_OUT']).nullable().optional(),
  today: z.array(attendanceEventResultSchema),
  serverTime: z.string().optional(),
});

export type AttendanceStatus = z.infer<typeof attendanceStatusSchema>;

/** Body of one submission (§3.4) — built by src/lib/ess/attendance/payload.ts. */
export interface AttendanceSubmission {
  eventId: string;
  idempotencyKey: string;
  method: AttendanceMethod;
  capturedAt: string;
  location?: {
    /** Absent → the server resolves the employee's primary store. */
    worksiteId?: string;
    latitude: number;
    longitude: number;
    accuracyMeters: number;
    distanceMeters?: number;
    withinGeofence?: boolean;
  };
  credential?: { type: 'QR'; payload: string };
}

export interface AttendanceEventsQuery {
  from?: string;
  limit?: number;
}

function parseOrThrow<T>(schema: z.ZodType<T>, raw: unknown, what: string): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    // Contract drift — fail loudly rather than render wrong attendance data.
    throw new EssApiError(`${what} did not match the API contract.`, 500, 'unavailable');
  }
  return parsed.data;
}

export class EssAttendanceApi {
  private readonly core: ReturnType<typeof createEssCore>;

  constructor(bridge: DeviceBridge, mobile: MobileAuthClient) {
    this.core = createEssCore(bridge, mobile);
  }

  async getConfig(): Promise<AttendanceConfig> {
    const data = await this.core.request<unknown>('GET', '/attendance/config');
    return parseOrThrow(attendanceConfigSchema, data, 'Attendance config');
  }

  async getWorksites(): Promise<AttendanceWorksite[]> {
    const data = await this.core.request<{ worksites: unknown }>('GET', '/attendance/worksites');
    const list = z.array(attendanceWorksiteSchema).safeParse(data.worksites);
    if (!list.success) throw new EssApiError('Worksite list did not match the API contract.', 500, 'unavailable');
    return list.data;
  }

  async getStatus(): Promise<AttendanceStatus> {
    const data = await this.core.request<unknown>('GET', '/attendance/status');
    return parseOrThrow(attendanceStatusSchema, data, 'Attendance status');
  }

  /** Single punch — immediate confirmation (contract §3.4/§3.5). */
  async submitEvent(submission: AttendanceSubmission): Promise<AttendanceEventResult> {
    const data = await this.core.request<{ event: unknown }>('POST', '/attendance/events', submission, {
      idempotencyKey: submission.idempotencyKey,
    });
    return parseOrThrow(attendanceEventResultSchema, data.event, 'Attendance event');
  }

  /** Offline drain — independent per-event results, contract §3.6. */
  async syncEvents(submissions: AttendanceSubmission[]): Promise<AttendanceEventResult[]> {
    const data = await this.core.request<{ results: unknown }>('POST', '/attendance/events/sync', {
      events: submissions,
    });
    const list = z.array(attendanceEventResultSchema).safeParse(data.results);
    if (!list.success) throw new EssApiError('Sync results did not match the API contract.', 500, 'unavailable');
    return list.data;
  }

  async getEvents(query: AttendanceEventsQuery = {}): Promise<AttendanceEventResult[]> {
    const params = new URLSearchParams();
    if (query.from) params.set('from', query.from);
    if (query.limit !== undefined) params.set('limit', String(query.limit));
    const qs = params.toString();
    const data = await this.core.request<{ events: unknown }>('GET', `/attendance/events${qs ? `?${qs}` : ''}`);
    const list = z.array(attendanceEventResultSchema).safeParse(data.events);
    if (!list.success) throw new EssApiError('Attendance history did not match the API contract.', 500, 'unavailable');
    return list.data;
  }

  async getEvent(id: string): Promise<AttendanceEventResult> {
    const data = await this.core.request<{ event: unknown }>('GET', `/attendance/events/${encodeURIComponent(id)}`);
    return parseOrThrow(attendanceEventResultSchema, data.event, 'Attendance event');
  }
}

/** Factory: ESS attendance client bound to the device bridge. */
export async function createEssAttendanceApi(bridge: DeviceBridge): Promise<EssAttendanceApi> {
  const mobile = await createMobileAuthClient(bridge);
  return new EssAttendanceApi(bridge, mobile);
}
