'use client';

import type { ReactNode } from 'react';
import { useAuthStore } from '@/stores/auth';

/** Renders children only when the session user holds the permission. */
export default function RequirePermission({
  permission,
  children,
  fallback = null,
}: {
  permission: string;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const can = useAuthStore((s) => s.can(permission));
  return <>{can ? children : fallback}</>;
}
