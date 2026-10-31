// Submission builder (contract §3.4) — emits ONLY the allowlisted keys the
// backend accepts. Never an employeeId, status or attendanceType: identity
// comes from the token and outcomes are server-authoritative (BRD §6).

import { generateId } from '@/lib/id';
import type { AttendanceSubmission } from '@/integration/ess/attendance';
import type { GeofenceEvaluation } from './geofence';

export interface EventIdentity {
  eventId: string;
  idempotencyKey: string;
  capturedAt: string;
}

/** Fresh identity for one capture: key == event id (contract §4.2). */
export function newAttendanceEvent(capturedAt: string = new Date().toISOString()): EventIdentity {
  const eventId = generateId();
  return { eventId, idempotencyKey: eventId, capturedAt };
}

export function buildGpsSubmission(
  identity: EventIdentity,
  args: {
    fix: { latitude: number; longitude: number; accuracyMeters: number };
    /** Absent → the server resolves the primary store (its doc §4). */
    worksite?: { id: string };
    /** Client-side distance/accuracy — informational for the server (contract §3.4). */
    evaluation?: GeofenceEvaluation;
  }
): AttendanceSubmission {
  return {
    ...identity,
    method: 'GPS',
    location: {
      ...(args.worksite ? { worksiteId: args.worksite.id } : {}),
      latitude: args.fix.latitude,
      longitude: args.fix.longitude,
      accuracyMeters: fixAccuracy(args.fix.accuracyMeters),
      ...(args.evaluation
        ? {
            distanceMeters: round1(args.evaluation.distanceMeters),
            withinGeofence: args.evaluation.withinRadius,
          }
        : {}),
    },
  };
}

export function buildQrSubmission(
  identity: EventIdentity,
  credential: { payload: string }
): AttendanceSubmission {
  return {
    ...identity,
    method: 'QR',
    credential: { type: 'QR', payload: credential.payload },
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function fixAccuracy(n: number): number {
  return Math.max(0, Math.round(n * 10) / 10);
}
