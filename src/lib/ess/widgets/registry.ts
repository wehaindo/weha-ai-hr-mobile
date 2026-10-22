// ESS dashboard widget registry (BRD §4.1D): metadata-driven widget
// definitions — id, title, type, order, permission, enabled. Rendering stays
// client-side (components); config is code for Phase 2, with a future
// server-override layer documented in docs/ESS-API-CONTRACT.md §3.

import type { ComponentType } from 'react';
import type { EssProfileState } from '@/hooks/useEssProfile';
import { EmployeeSummaryWidget } from '@/components/ess/widgets/employee-summary-widget';
import { ServiceShortcutsWidget } from '@/components/ess/widgets/service-shortcuts-widget';
import { UnavailableWidget } from '@/components/ess/widgets/unavailable-widget';

export type { EssServiceDef } from './services';
export { ESS_SERVICES, listEssServices } from './services';

export interface EssWidgetProps {
  profile: EssProfileState;
  title: string;
}

export type EssWidgetType = 'summary' | 'shortcut' | 'placeholder' | 'quick-actions';

export interface EssWidgetDef {
  id: string;
  title: string;
  type: EssWidgetType;
  order: number;
  enabled: boolean;
  permission?: string;
  component: ComponentType<EssWidgetProps>;
}

export const ESS_WIDGET_DEFS: EssWidgetDef[] = [
  {
    id: 'employee-summary',
    title: 'Employee summary',
    type: 'summary',
    order: 10,
    enabled: true,
    permission: 'ess.use',
    component: EmployeeSummaryWidget,
  },
  {
    id: 'service-shortcuts',
    title: 'Quick actions',
    type: 'shortcut',
    order: 20,
    enabled: true,
    permission: 'ess.use',
    component: ServiceShortcutsWidget,
  },
  {
    id: 'announcements',
    title: 'Announcements',
    type: 'placeholder',
    order: 30,
    enabled: true,
    permission: 'ess.use',
    component: UnavailableWidget,
  },
  {
    id: 'pending-actions',
    title: 'Pending actions',
    type: 'placeholder',
    order: 40,
    enabled: true,
    permission: 'ess.use',
    component: UnavailableWidget,
  },
];

/** Enabled + authorized widgets, in display order. A widget never grants route access. */
export function listEssWidgets(permissions: string[]): EssWidgetDef[] {
  return ESS_WIDGET_DEFS.filter(
    (w) => w.enabled && (!w.permission || permissions.includes(w.permission))
  ).sort((a, b) => a.order - b.order);
}
