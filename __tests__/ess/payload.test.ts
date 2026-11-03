import { describe, expect, it } from 'vitest';
import {
  buildGpsSubmission,
  buildQrSubmission,
  newAttendanceEvent,
} from '@/lib/ess/attendance/payload';

const IDENTITY = {
  eventId: 'aaaaaaaaaaaaaaa1',
  idempotencyKey: 'aaaaaaaaaaaaaaa1',
  capturedAt: '2026-10-22T08:01:59.000Z',
};

describe('newAttendanceEvent', () => {
  it('generates a 16-hex event id with the key equal to the id', () => {
    const identity = newAttendanceEvent('2026-10-22T08:01:59.000Z');

    expect(identity.eventId).toMatch(/^[0-9a-f]{16}$/);
    expect(identity.idempotencyKey).toBe(identity.eventId);
    expect(identity.capturedAt).toBe('2026-10-22T08:01:59.000Z');
  });

  it('generates unique ids across captures', () => {
    const a = newAttendanceEvent();
    const b = newAttendanceEvent();
    expect(a.eventId).not.toBe(b.eventId);
  });
});

describe('buildGpsSubmission', () => {
  it('emits only allowlisted keys — never employeeId, status or attendanceType', () => {
    const submission = buildGpsSubmission(IDENTITY, {
      fix: { latitude: -6.20881, longitude: 106.84562, accuracyMeters: 12.34 },
    });

    expect(Object.keys(submission).sort()).toEqual(['capturedAt', 'eventId', 'idempotencyKey', 'location', 'method']);
    const forbidden = ['employeeId', 'id', 'status', 'attendanceType', 'receivedAt', 'companyId'];
    for (const key of forbidden) expect(Object.keys(submission)).not.toContain(key);
    expect(Object.keys(submission.location ?? {})).not.toContain('employeeId');
  });

  it('carries the raw fix only — worksite/geofence stay server-side', () => {
    const submission = buildGpsSubmission(IDENTITY, {
      fix: { latitude: -6.20881, longitude: 106.84562, accuracyMeters: 12.34 },
    });

    expect(submission.method).toBe('GPS');
    expect(submission.location).toEqual({
      latitude: -6.20881,
      longitude: 106.84562,
      accuracyMeters: 12.3,
    });
    // The client never sends worksite ids, client distance or geofence verdicts.
    for (const key of ['worksiteId', 'distanceMeters', 'withinGeofence']) {
      expect(Object.keys(submission.location ?? {})).not.toContain(key);
    }
    expect(submission.idempotencyKey).toBe(submission.eventId);
  });
});

describe('buildQrSubmission', () => {
  it('emits only allowlisted keys with an opaque credential', () => {
    const submission = buildQrSubmission(IDENTITY, { payload: 'WEHAATT:abc123' });

    expect(Object.keys(submission).sort()).toEqual(['capturedAt', 'credential', 'eventId', 'idempotencyKey', 'method']);
    expect(submission.method).toBe('QR');
    expect(submission.credential).toEqual({ type: 'QR', payload: 'WEHAATT:abc123' });
    expect(submission.location).toBeUndefined();
  });
});
