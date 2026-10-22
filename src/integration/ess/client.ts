// ESS profile client — `GET/PATCH /api/mobile/v1/employees/me` via the shared
// core (see ./core.ts for transport, auth and error semantics). The client
// NEVER sends an employee id — the backend resolves identity from the token.

import { z } from 'zod';
import type { DeviceBridge } from '@/platform';
import { createMobileAuthClient, type MobileAuthClient } from '@/integration/mobile-auth/client';
import { createEssCore, EssApiError } from './core';

export { EssApiError, type EssApiErrorCode } from './core';

// Unknown keys are stripped by zod — sensitive columns (salary, nik, npwp,
// bank…) can never reach component state even if a server leaks them.
export const essEmployeeSchema = z.object({
  id: z.string(),
  employeeNumber: z.string().nullable().optional(),
  firstName: z.string().nullable().optional(),
  lastName: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  status: z.string().optional(),
  isActive: z.boolean().optional(),
  companyId: z.string().nullable().optional(),
  departmentId: z.string().nullable().optional(),
  positionId: z.string().nullable().optional(),
  managerId: z.string().nullable().optional(),
  position: z.string().nullable().optional(),
  hireDate: z.string().nullable().optional(),
  birthDate: z.string().nullable().optional(),
  gender: z.string().nullable().optional(),
  maritalStatus: z.string().nullable().optional(),
  avatarColor: z.string().nullable().optional(),
  company: z.object({ id: z.string(), name: z.string() }).nullable().optional(),
  department: z.object({ id: z.string(), name: z.string() }).nullable().optional(),
  manager: z
    .object({ id: z.string(), firstName: z.string().nullable(), lastName: z.string().nullable(), name: z.string().nullable() })
    .nullable()
    .optional(),
});

export type EssEmployee = z.infer<typeof essEmployeeSchema>;

/** Allowlisted profile fields (docs/ESS-API-CONTRACT.md §2.2). */
export const EDITABLE_PROFILE_FIELDS = ['email', 'phone'] as const;
export type EssProfilePatch = {
  email?: string;
  phone?: string;
};

export class EssApiClient {
  private readonly core: ReturnType<typeof createEssCore>;

  constructor(bridge: DeviceBridge, mobile: MobileAuthClient) {
    this.core = createEssCore(bridge, mobile);
  }

  /** GET /employees/me — the authorized profile (identity from token). */
  async getProfile(): Promise<EssEmployee> {
    const employee = await this.core.request<{ employee: unknown }>('GET', '/employees/me');
    return this.parse(employee.employee);
  }

  /**
   * PATCH /employees/me — only allowlisted, changed fields are ever sent;
   * no employee id travels with the request (server-resolved identity).
   */
  async updateProfile(patch: EssProfilePatch): Promise<EssEmployee> {
    const body: EssProfilePatch = {};
    if (patch.email !== undefined) body.email = patch.email;
    if (patch.phone !== undefined) body.phone = patch.phone;
    if (Object.keys(body).length === 0) {
      throw new EssApiError('Nothing to update.', 400, 'validation');
    }
    const result = await this.core.request<{ employee: unknown }>('PATCH', '/employees/me', body);
    return this.parse(result.employee);
  }

  private parse(raw: unknown): EssEmployee {
    const parsed = essEmployeeSchema.safeParse(raw);
    if (!parsed.success) {
      // Contract drift between backend and client — fail loudly, render nothing.
      throw new EssApiError('Profile response did not match the API contract.', 500, 'unavailable');
    }
    return parsed.data;
  }
}

/** Factory: ESS profile client bound to the device bridge (web / Capacitor / Electron). */
export async function createEssApiClient(bridge: DeviceBridge): Promise<EssApiClient> {
  const mobile = await createMobileAuthClient(bridge);
  return new EssApiClient(bridge, mobile);
}
