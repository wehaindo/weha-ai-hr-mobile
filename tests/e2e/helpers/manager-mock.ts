import type { Page, Route } from '@playwright/test';
import { CORS_HEADERS } from './ess-mock';

// Mocks `/api/mobile/v1/ess/manager/*` (contract: docs/ESS-MANAGER-CONTRACT.md
// §4.1/4.2). Register AFTER mockEssApi.

export const TEAM: Array<Record<string, unknown>> = [
  {
    employeeId: 'e-1',
    name: 'Budi Santoso',
    department: 'Operations',
    todayAttendance: { status: 'PRESENT', checkIn: '08:01', checkOut: null },
    pendingCount: 1,
  },
  {
    employeeId: 'e-2',
    name: 'Sari Admin',
    department: 'Operations',
    todayAttendance: null, // not yet calculated — honest state
    pendingCount: 0,
  },
];

export const DASHBOARD = {
  teamCount: 8,
  pendingCount: 3,
  completed30d: 12,
  rejected30d: 1,
  overdueCount: 1,
  team: TEAM,
  salary: '99999999', // leak probe — must be stripped before render
};

export interface ManagerMockCalls {
  dashboardAuth: (string | null)[];
  teamQueries: string[];
}

export interface ManagerMockOptions {
  dashboard?: Record<string, unknown>;
  /** Serve an empty team (non-manager honest empty state). */
  empty?: boolean;
}

export async function mockManagerApi(page: Page, options: ManagerMockOptions = {}): Promise<{ calls: ManagerMockCalls }> {
  const calls: ManagerMockCalls = { dashboardAuth: [], teamQueries: [] };

  await page.route('**/api/mobile/v1/ess/manager/**', async (route: Route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS_HEADERS });
      return;
    }

    const respond = (status: number, json: Record<string, unknown>) =>
      route.fulfill({ status, headers: CORS_HEADERS, contentType: 'application/json', body: JSON.stringify(json) });

    const url = request.url();

    if (url.includes('/ess/manager/dashboard')) {
      calls.dashboardAuth.push(request.headers()['authorization'] ?? null);
      const dashboard = options.empty
        ? { teamCount: 0, pendingCount: 0, completed30d: 0, rejected30d: 0, overdueCount: 0, team: [] }
        : (options.dashboard ?? DASHBOARD);
      return respond(200, { success: true, data: dashboard });
    }
    if (url.includes('/ess/manager/team')) {
      const search = new URL(url).searchParams.get('search');
      const cursor = new URL(url).searchParams.get('cursor');
      calls.teamQueries.push(url.slice(url.indexOf('?')));
      let team = options.empty ? [] : TEAM;
      if (search) team = team.filter((member) => String(member.name).toLowerCase().includes(search.toLowerCase()));
      let nextCursor: string | null = null;
      if (cursor) {
        team = team.slice(1); // page 2+ (append-safe)
      } else if (team.length > 1) {
        team = team.slice(0, 1);
        nextCursor = 'team-page-2';
      }
      return respond(200, { success: true, data: { team, nextCursor } });
    }

    return route.fallback();
  });

  return { calls };
}
