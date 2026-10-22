// Permission registry + default roles. Pure module: imported by migrations (Electron
// main + renderer) and by UI guards — keep it free of React / heavy imports.

export const PERMISSIONS = [
  { id: 'app.use', label: 'Use application', category: 'General' },
  { id: 'users.manage', label: 'Manage users and roles', category: 'Users' },
  { id: 'settings.manage', label: 'Change device settings', category: 'Settings' },
  { id: 'sync.manage', label: 'Manage ERP synchronization', category: 'Sync' },
  { id: 'print.manage', label: 'Manage printers and print jobs', category: 'Print' },
  { id: 'hardware.manage', label: 'Manage hardware devices', category: 'Hardware' },
  { id: 'integration.manage', label: 'Manage integrations and sync entities', category: 'Integration' },
  { id: 'datahub.manage', label: 'Manage Data Hub replication', category: 'Data Hub' },
  { id: 'cloud.manage', label: 'Manage cloud sync (Google/Supabase/Grist)', category: 'Cloud' },
  { id: 'ecr.use', label: 'Use payment terminals', category: 'Payments' },
  { id: 'realtime.manage', label: 'Manage realtime channel', category: 'Realtime' },
  { id: 'security.manage', label: 'Manage security policy', category: 'Security' },
  { id: 'backup.manage', label: 'Backup, restore and clear data', category: 'Backup' },
  { id: 'retention.manage', label: 'Manage data retention', category: 'Retention' },
  { id: 'ai.manage', label: 'Manage AI / voice configuration', category: 'AI' },
  { id: 'testing.manage', label: 'Manage testing fixtures and test sync', category: 'Testing' },
  { id: 'audit.view', label: 'View audit log', category: 'Settings' },
  { id: 'transactions.use', label: 'Record transactions', category: 'Transactions' },
  { id: 'ess.use', label: 'Use employee self-service', category: 'ESS' },
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
    permissions: [
      'app.use',
      'print.manage',
      'hardware.manage',
      'integration.manage',
      'datahub.manage',
      'cloud.manage',
      'ecr.use',
      'realtime.manage',
      'security.manage',
      'backup.manage',
      'retention.manage',
      'ai.manage',
      'testing.manage',
      'audit.view',
      'transactions.use',
      'ess.use',
    ],
  },
  { id: 'operator', name: 'Operator', permissions: ['app.use', 'transactions.use', 'ess.use'] },
];

export const DEFAULT_ROLES = SYSTEM_ROLES.map((r) => r.id);
