// Permission registry + default roles. Pure module: imported by migrations (Electron
// main + renderer) and by UI guards — keep it free of React / heavy imports.

export const PERMISSIONS = [
  { id: 'app.use', label: 'Use application', category: 'General' },
  { id: 'users.manage', label: 'Manage users and roles', category: 'Users' },
  { id: 'settings.manage', label: 'Change device settings', category: 'Settings' },
  { id: 'sync.manage', label: 'Manage ERP synchronization', category: 'Sync' },
  { id: 'print.manage', label: 'Manage printers and print jobs', category: 'Print' },
  { id: 'audit.view', label: 'View audit log', category: 'Settings' },
] as const;

export type PermissionId = (typeof PERMISSIONS)[number]['id'];

export const ALL_PERMISSIONS: PermissionId[] = PERMISSIONS.map((p) => p.id);

export interface RoleSeed {
  id: string;
  name: string;
  permissions: PermissionId[];
}

export const SYSTEM_ROLES: RoleSeed[] = [
  { id: 'admin', name: 'Administrator', permissions: [...ALL_PERMISSIONS] },
  {
    id: 'manager',
    name: 'Manager',
    permissions: ['app.use', 'print.manage', 'audit.view'],
  },
  { id: 'operator', name: 'Operator', permissions: ['app.use'] },
];

export const DEFAULT_ROLES = SYSTEM_ROLES.map((r) => r.id);
