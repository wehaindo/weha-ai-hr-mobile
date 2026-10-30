import { describe, expect, it } from 'vitest';
import { evaluateLocation, haversineMeters } from '@/lib/ess/attendance/geofence';

// Reference point: WEHA Retail worksite (Jakarta).
const WORKSITE = {
  id: 'ws-1',
  latitude: -6.2088,
  longitude: 106.8456,
  radiusMeters: 100,
  maxAccuracyMeters: 100,
};

const POLICY = { geofencePolicy: 'REJECT' } as const;

/** Offset a point north by roughly `meters` from the worksite. */
function northOf(meters: number) {
  const dLat = meters / 111320; // meters per degree of latitude
  return { latitude: WORKSITE.latitude + dLat, longitude: WORKSITE.longitude };
}

describe('haversineMeters', () => {
  it('is zero for identical points', () => {
    expect(haversineMeters(WORKSITE, WORKSITE)).toBeCloseTo(0, 5);
  });

  it('matches a known ~1.11 km latitude offset (0.01°)', () => {
    const point = { latitude: WORKSITE.latitude + 0.01, longitude: WORKSITE.longitude };
    const meters = haversineMeters(WORKSITE, point);
    expect(meters).toBeGreaterThan(1100);
    expect(meters).toBeLessThan(1120);
  });
});

describe('evaluateLocation (BRD FR-03 policy table)', () => {
  it('allows a fix inside the radius with acceptable accuracy', () => {
    const fix = { ...northOf(30), accuracyMeters: 12, capturedAt: '2026-10-22T08:01:00.000Z' };
    const result = evaluateLocation(fix, WORKSITE, POLICY);

    expect(result.verdict).toBe('allow');
    expect(result.reason).toBe('inside_geofence');
    expect(result.withinRadius).toBe(true);
    expect(result.distanceMeters).toBeGreaterThan(0);
    expect(result.distanceMeters).toBeLessThan(40);
  });

  it('rejects a fix outside the radius under policy REJECT', () => {
    const fix = { ...northOf(500), accuracyMeters: 10, capturedAt: '2026-10-22T08:01:00.000Z' };
    const result = evaluateLocation(fix, WORKSITE, POLICY);

    expect(result.verdict).toBe('reject');
    expect(result.reason).toBe('outside_geofence');
    expect(result.withinRadius).toBe(false);
  });

  it('routes a fix outside the radius to exception under policy EXCEPTION', () => {
    const fix = { ...northOf(500), accuracyMeters: 10, capturedAt: '2026-10-22T08:01:00.000Z' };
    const result = evaluateLocation(fix, WORKSITE, { geofencePolicy: 'EXCEPTION' });

    expect(result.verdict).toBe('exception');
    expect(result.reason).toBe('outside_geofence');
  });

  it('treats the backend raw policy ALLOW like EXCEPTION (submit for review)', () => {
    const fix = { ...northOf(500), accuracyMeters: 10, capturedAt: '2026-10-22T08:01:00.000Z' };
    const result = evaluateLocation(fix, WORKSITE, { geofencePolicy: 'ALLOW' });

    expect(result.verdict).toBe('exception');
    expect(result.reason).toBe('outside_geofence');
  });

  it('asks for a retry when reported accuracy is too poor — even inside the radius', () => {
    const fix = { ...northOf(5), accuracyMeters: 250, capturedAt: '2026-10-22T08:01:00.000Z' };
    const result = evaluateLocation(fix, WORKSITE, POLICY);

    expect(result.verdict).toBe('retry_accuracy');
    expect(result.reason).toBe('accuracy_too_low');
    expect(result.accuracyOk).toBe(false);
  });

  it('accepts accuracy exactly at the threshold (boundary is inclusive)', () => {
    const fix = { ...northOf(10), accuracyMeters: 100, capturedAt: '2026-10-22T08:01:00.000Z' };
    expect(evaluateLocation(fix, WORKSITE, POLICY).verdict).toBe('allow');
  });

  it('treats a fix exactly on the radius boundary as inside', () => {
    const fix = { ...northOf(100), accuracyMeters: 5, capturedAt: '2026-10-22T08:01:00.000Z' };
    const result = evaluateLocation(fix, WORKSITE, POLICY);
    expect(result.distanceMeters).toBeCloseTo(100, 0);
    expect(result.withinRadius).toBe(true);
  });

  it('uses the worksite accuracy threshold (site-specific beats company default)', () => {
    const tightWorksite = { ...WORKSITE, maxAccuracyMeters: 30 };
    const fix = { ...northOf(10), accuracyMeters: 50, capturedAt: '2026-10-22T08:01:00.000Z' };

    expect(evaluateLocation(fix, tightWorksite, POLICY).verdict).toBe('retry_accuracy');
    expect(evaluateLocation(fix, WORKSITE, POLICY).verdict).toBe('allow');
  });
});
