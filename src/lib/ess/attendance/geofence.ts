// Geofence evaluation (BRD FR-03) — pure functions, no I/O. These verdicts
// drive instant client feedback and the submit gate; the SERVER recomputes
// distance and applies the authoritative policy (contract §2.6).

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface LocationFixLike extends GeoPoint {
  accuracyMeters: number;
  capturedAt: string;
}

export interface WorksiteGeo extends GeoPoint {
  id: string;
  radiusMeters: number;
  maxAccuracyMeters: number;
}

/**
 * allow           → inside the geofence with acceptable accuracy
 * reject          → outside; policy REJECT blocks the submission
 * exception       → outside; policy EXCEPTION submits for server review
 * retry_accuracy  → reported accuracy is too poor to trust the position
 */
export type GeofenceVerdict = 'allow' | 'reject' | 'exception' | 'retry_accuracy';

export type GeofenceReason = 'inside_geofence' | 'outside_geofence' | 'accuracy_too_low';

export interface GeofenceEvaluation {
  verdict: GeofenceVerdict;
  reason: GeofenceReason;
  distanceMeters: number;
  withinRadius: boolean;
  accuracyOk: boolean;
  worksiteId: string;
}

const EARTH_RADIUS_M = 6371000;

/** Great-circle distance in meters (haversine). */
export function haversineMeters(a: GeoPoint, b: GeoPoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Evaluate a fix against a worksite. The worksite's own accuracy threshold
 * wins over the company default (site-specific beats general); check order
 * follows the BRD §3 policy table — accuracy first (an unreliable fix cannot
 * establish distance), then the radius.
 */
export function evaluateLocation(
  fix: LocationFixLike,
  worksite: WorksiteGeo,
  policy: { geofencePolicy: 'REJECT' | 'EXCEPTION' | 'ALLOW' }
): GeofenceEvaluation {
  const distanceMeters = haversineMeters(fix, worksite);
  const withinRadius = distanceMeters <= worksite.radiusMeters;
  const accuracyOk = fix.accuracyMeters <= worksite.maxAccuracyMeters;

  const base = { distanceMeters, withinRadius, accuracyOk, worksiteId: worksite.id };

  if (!accuracyOk) {
    return { ...base, verdict: 'retry_accuracy', reason: 'accuracy_too_low' };
  }
  if (!withinRadius) {
    // REJECT blocks on the device; anything else (EXCEPTION/ALLOW) submits
    // for the server's authoritative review — mirroring weha-ai-hrd.
    return {
      ...base,
      verdict: policy.geofencePolicy === 'REJECT' ? 'reject' : 'exception',
      reason: 'outside_geofence',
    };
  }
  return { ...base, verdict: 'allow', reason: 'inside_geofence' };
}
