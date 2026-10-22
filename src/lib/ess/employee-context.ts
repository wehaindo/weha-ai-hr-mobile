// ESS employee context — the client-facing identity contract (BRD §8.3).
// Identity/tenant come from the verified backend session (mobile auth) or the
// local device account; the backend always authorizes server-side — this
// context is display/trust metadata only.

import type { DeviceBridge } from '@/platform';
import type { SessionUser } from '@/stores/auth';
import { loadMobileSession } from '@/auth/mobile-session';
import type { MobileIdentity } from '@/integration/mobile-auth/client';

export interface EssEmployeeContext {
  employeeId: string | null;
  tenantId: string | null;
  displayName: string;
  employeeCode: string | null;
  departmentId: string | null;
  roles: string[];
  permissions: string[];
  authSource: 'local' | 'mobile';
  email: string | null;
}

/**
 * Profile enrichment (employee code, department, …) — PENDING backend endpoint
 * (BRD §9.3). Returns nulls and `source: 'pending'` so callers can never
 * mistake placeholder values for real employee data.
 */
export async function fetchProfileEnrichment(): Promise<{
  employeeCode: string | null;
  departmentId: string | null;
  source: 'pending';
}> {
  return { employeeCode: null, departmentId: null, source: 'pending' };
}

export async function loadEmployeeContext(
  bridge: DeviceBridge,
  session: SessionUser
): Promise<EssEmployeeContext> {
  let identity: MobileIdentity | null = null;
  if (session.authSource === 'mobile') {
    const row = await loadMobileSession(bridge);
    if (row?.identity_json) {
      try {
        identity = JSON.parse(row.identity_json) as MobileIdentity;
      } catch {
        identity = null;
      }
    }
  }

  const enrichment = await fetchProfileEnrichment();

  return {
    employeeId: identity?.employeeId ?? null,
    tenantId: identity?.tenantSlug ?? null,
    displayName: session.display_name,
    employeeCode: enrichment.employeeCode,
    departmentId: enrichment.departmentId,
    roles: [session.role],
    permissions: session.permissions,
    authSource: session.authSource ?? 'local',
    email: identity?.email ?? null,
  };
}
