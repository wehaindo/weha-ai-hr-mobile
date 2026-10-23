// ESS manager client — `/api/mobile/v1/ess/manager/*` + delegations via the
// shared core (docs/ESS-MANAGER-CONTRACT.md §4). The team/dashboard scope is
// computed server-side from the token employee — client-supplied ids are
// never sent, and projections are whitelisted (no salary/personal data,
// BRD §8).

import { z } from 'zod';
import type { DeviceBridge } from '@/platform';
import { createMobileAuthClient, type MobileAuthClient } from '@/integration/mobile-auth/client';
import { createEssCore, EssApiError, type EssCore } from './core';

export { EssApiError } from './core';

/** HRD AttendanceStatus values projected onto team rows (contract §4.1). */
export const TEAM_ATTENDANCE_STATUSES = [
  'PRESENT',
  'ABSENT',
  'LATE',
  'HALF_DAY',
  'ON_LEAVE',
  'HOLIDAY',
  'REST_DAY',
  'INCOMPLETE',
] as const;
export type TeamAttendanceStatus = (typeof TEAM_ATTENDANCE_STATUSES)[number];

export const teamAttendanceSchema = z.object({
  status: z.enum(TEAM_ATTENDANCE_STATUSES),
  checkIn: z.string().nullable().optional(),
  checkOut: z.string().nullable().optional(),
});
export type TeamAttendance = z.infer<typeof teamAttendanceSchema>;

export const teamMemberSchema = z.object({
  employeeId: z.string(),
  name: z.string(),
  department: z.string().nullable().optional(),
  todayAttendance: teamAttendanceSchema.nullable().optional(), // null → not yet calculated
  pendingCount: z.coerce.number(),
});
export type TeamMember = z.infer<typeof teamMemberSchema>;

export const managerDashboardSchema = z.object({
  teamCount: z.coerce.number(),
  pendingCount: z.coerce.number(),
  completed30d: z.coerce.number(),
  rejected30d: z.coerce.number(),
  overdueCount: z.coerce.number(),
  team: z.array(teamMemberSchema),
  serverTime: z.string().optional(),
});
export type ManagerDashboard = z.infer<typeof managerDashboardSchema>;

export interface ManagerTeamPage {
  team: TeamMember[];
  nextCursor: string | null;
}

export const delegationSchema = z.object({
  id: z.string(),
  direction: z.enum(['INBOUND', 'OUTBOUND']),
  counterpart: z.object({ id: z.string(), name: z.string() }),
  startsAt: z.string(),
  endsAt: z.string(),
  formTypes: z.array(z.string()).nullable().optional(),
  isActive: z.boolean(),
});
export type ApprovalDelegationView = z.infer<typeof delegationSchema>;

export interface TeamQuery {
  search?: string;
  cursor?: string;
}

function parseOrThrow<T>(schema: z.ZodType<T>, raw: unknown, what: string): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    // Contract drift — fail loudly rather than render wrong team data.
    throw new EssApiError(`${what} did not match the API contract.`, 500, 'unavailable');
  }
  return parsed.data;
}

function parseListOrThrow<T>(schema: z.ZodType<T[]>, raw: unknown, what: string): T[] {
  const list = schema.safeParse(raw);
  if (!list.success) throw new EssApiError(`${what} did not match the API contract.`, 500, 'unavailable');
  return list.data;
}

export class EssManagerApi {
  private readonly core: EssCore;

  constructor(bridge: DeviceBridge, mobile: MobileAuthClient) {
    this.core = createEssCore(bridge, mobile);
  }

  /** FR-601 dashboard: counts + authorized team snapshot. */
  async getDashboard(): Promise<ManagerDashboard> {
    const data = await this.core.request<unknown>('GET', '/ess/manager/dashboard');
    return parseOrThrow(managerDashboardSchema, data, 'Manager dashboard');
  }

  /** FR-601/602 paginated team with server-side search. */
  async getTeam(query: TeamQuery = {}): Promise<ManagerTeamPage> {
    const params = new URLSearchParams();
    if (query.search) params.set('search', query.search);
    if (query.cursor) params.set('cursor', query.cursor);
    const qs = params.toString();
    const data = await this.core.request<{ team: unknown; nextCursor?: unknown }>(
      'GET',
      `/ess/manager/team${qs ? `?${qs}` : ''}`
    );
    return {
      team: parseListOrThrow(z.array(teamMemberSchema), data.team, 'Manager team'),
      nextCursor: typeof data.nextCursor === 'string' ? data.nextCursor : null,
    };
  }

  /** FR-606 read-only delegation rules for the token employee. */
  async getDelegations(scope?: 'inbound' | 'outbound'): Promise<ApprovalDelegationView[]> {
    const qs = scope ? `?scope=${scope}` : '';
    const data = await this.core.request<{ delegations: unknown }>('GET', `/ess/delegations${qs}`);
    return parseListOrThrow(z.array(delegationSchema), data.delegations, 'Delegations');
  }
}

/** Factory: ESS manager client bound to the device bridge. */
export async function createEssManagerApi(bridge: DeviceBridge): Promise<EssManagerApi> {
  const mobile = await createMobileAuthClient(bridge);
  return new EssManagerApi(bridge, mobile);
}
