'use client';

// ESS dashboard: welcome header, request-status grid (2 columns, one card per
// request type) and the My attendance section below it. Device/ERP sync
// details live on /sync and /settings.

import { useAuthStore } from '@/stores/auth';
import { useEssProfile } from '@/hooks/useEssProfile';
import deviceConfig from '@/device.config';
import { RequestStatusGrid } from '@/components/ess/dashboard/request-status-grid';
import { AttendanceSection } from '@/components/ess/dashboard/attendance-section';

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const permissions = user?.permissions ?? [];
  const { state: essProfile } = useEssProfile();

  const employeeName =
    essProfile.status === 'ready'
      ? essProfile.employee.name?.trim() ||
        [essProfile.employee.firstName, essProfile.employee.lastName].filter(Boolean).join(' ').trim() ||
        user?.display_name
      : user?.display_name;

  const canUseEss = permissions.includes('ess.use');

  return (
    <div className="mx-auto max-w-4xl space-y-6" data-testid="dashboard">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Welcome back, {employeeName ?? 'there'}</h2>
        <p className="text-sm text-muted-foreground">
          {essProfile.status === 'ready'
            ? [essProfile.employee.position, essProfile.employee.employeeNumber]
                .filter(Boolean)
                .join(' · ') || deviceConfig.appName
            : `${deviceConfig.appName} employee dashboard`}
        </p>
      </div>

      {canUseEss && <RequestStatusGrid />}
      {canUseEss && <AttendanceSection />}
    </div>
  );
}
