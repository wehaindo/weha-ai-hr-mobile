import type { Page, Route } from '@playwright/test';
import { CORS_HEADERS } from './ess-mock';

// Mocks `/api/mobile/v1/attendance/*` (contract: docs/ESS-ATTENDANCE-CONTRACT.md).
// Register AFTER mockEssApi — non-attendance paths fall through to it.

export const ATTENDANCE_WORKSITE = {
  id: 'ws-1',
  name: 'WEHA Retail — HQ',
  storeId: 'st-1',
  latitude: -6.2088,
  longitude: 106.8456,
  radiusMeters: 100,
  // Generous on purpose: Playwright's geolocation mock does not expose the
  // reported accuracy, so the e2e cannot assert the accuracy policy (unit-tested).
  maxAccuracyMeters: 1000,
  qrEnabled: true,
  isPrimary: true,
  isActive: true,
};

export interface AttendancePunchCall {
  body: Record<string, unknown>;
  authorization: string | null;
  idempotencyKey: string | null;
}

export interface AttendanceMockCalls {
  configAuth: (string | null)[];
  statusGets: number;
  punchPosts: AttendancePunchCall[];
}

export interface AttendanceMockHandlers {
  /** Override the single-event POST result (e.g. return a DUPLICATE). */
  punch?: (body: Record<string, unknown>) => { status: number; json: Record<string, unknown> };
}

export function acceptedEvent(body: Record<string, unknown>): Record<string, unknown> {
  return {
    id: body.eventId,
    attendanceType: 'CHECK_IN',
    method: body.method ?? 'GPS',
    status: 'ACCEPTED',
    recordedAt: '2026-10-22T08:02:15.000Z',
    receivedAt: '2026-10-22T08:02:01.220Z',
    worksite: { id: ATTENDANCE_WORKSITE.id, name: ATTENDANCE_WORKSITE.name },
    distanceMeters: 12,
    rejectionReason: null,
    duplicateOfEventId: null,
  };
}

export async function mockAttendanceApi(
  page: Page,
  handlers: AttendanceMockHandlers = {}
): Promise<AttendanceMockCalls> {
  const calls: AttendanceMockCalls = { configAuth: [], statusGets: 0, punchPosts: [] };

  await page.route('**/api/mobile/v1/attendance/**', async (route: Route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS_HEADERS });
      return;
    }

    const respond = (status: number, json: Record<string, unknown>) =>
      route.fulfill({
        status,
        headers: CORS_HEADERS,
        contentType: 'application/json',
        body: JSON.stringify(json),
      });

    const url = request.url();
    const auth = request.headers()['authorization'] ?? null;

    if (url.includes('/attendance/config')) {
      calls.configAuth.push(auth);
      return respond(200, {
        success: true,
        data: {
          methods: ['GPS', 'QR'],
          policy: {
            duplicateIntervalSeconds: 120,
            offlineAllowed: true,
            geofencePolicy: 'REJECT',
            maxAccuracyMeters: 1000,
            lateSyncHours: 24,
          },
          serverTime: '2026-10-22T08:00:00.000Z',
        },
      });
    }
    if (url.includes('/attendance/worksites')) {
      return respond(200, { success: true, data: { worksites: [ATTENDANCE_WORKSITE] } });
    }
    if (url.includes('/attendance/status')) {
      calls.statusGets += 1;
      return respond(200, {
        success: true,
        data: {
          current: 'NOT_STARTED',
          expectedNext: 'CHECK_IN',
          today: [],
          serverTime: '2026-10-22T08:00:00.000Z',
        },
      });
    }
    if (url.includes('/attendance/events/sync')) {
      const body = (request.postDataJSON() ?? {}) as { events?: Record<string, unknown>[] };
      const events = body.events ?? [];
      return respond(200, { success: true, data: { results: events.map((e) => acceptedEvent(e)), serverTime: '2026-10-22T08:00:00.000Z' } });
    }
    if (url.includes('/attendance/events') && request.method() === 'POST') {
      const body = (request.postDataJSON() ?? {}) as Record<string, unknown>;
      calls.punchPosts.push({
        body,
        authorization: auth,
        idempotencyKey: request.headers()['idempotency-key'] ?? null,
      });
      const outcome = handlers.punch?.(body) ?? { status: 200, json: { success: true, data: { event: acceptedEvent(body) } } };
      return respond(outcome.status, outcome.json);
    }
    if (url.includes('/attendance/events')) {
      return respond(200, { success: true, data: { events: [], serverTime: '2026-10-22T08:00:00.000Z' } });
    }

    return route.fallback();
  });

  return calls;
}
