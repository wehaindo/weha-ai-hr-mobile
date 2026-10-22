// ESS service shortcuts (BRD §4.1C) — separate module so widget components
// can consume it without an import cycle through the widget registry.

import type { LucideIcon } from 'lucide-react';
import { CalendarCheck, CalendarDays, FileText, Inbox, Megaphone, User, Wallet } from 'lucide-react';

export interface EssServiceDef {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Present only for services whose route exists today. */
  href?: string;
  status: 'available' | 'coming';
  permission?: string;
}

export const ESS_SERVICES: EssServiceDef[] = [
  { id: 'profile', label: 'My Profile', icon: User, href: '/profile', status: 'available', permission: 'ess.use' },
  { id: 'attendance', label: 'Attendance', icon: CalendarCheck, href: '/attendance', status: 'available', permission: 'ess.use' },
  { id: 'leave', label: 'Leave', icon: CalendarDays, href: '/leave', status: 'available', permission: 'ess.use' },
  { id: 'requests', label: 'Requests', icon: Inbox, href: '/requests', status: 'available', permission: 'ess.use' },
  { id: 'payslips', label: 'Payslips', icon: Wallet, status: 'coming' },
  { id: 'documents', label: 'Employment documents', icon: FileText, status: 'coming' },
  { id: 'announcements', label: 'Announcements', icon: Megaphone, status: 'coming' },
];

/**
 * Services the current employee may see. `available` entries are authorized
 * AND have a route; `coming` entries render as clearly-marked unavailable
 * (never fabricated data, never linked — BRD §4.1B/C).
 */
export function listEssServices(permissions: string[]): EssServiceDef[] {
  return ESS_SERVICES.filter((s) => {
    if (s.status === 'available') {
      return !!s.href && (!s.permission || permissions.includes(s.permission));
    }
    return !s.permission || permissions.includes(s.permission);
  });
}
