'use client';

import Link from 'next/link';
import { redirect, usePathname } from 'next/navigation';
import { SettingsIcon, SparklesIcon, UsersIcon, InfoIcon, CpuIcon, FileTextIcon, PlugIcon, CloudIcon, RadioIcon, CloudSyncIcon, HomeIcon, LayoutDashboardIcon, ReceiptIcon, ShieldIcon, SaveIcon, MicIcon, ArchiveIcon, FlaskConical, BellIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import deviceConfig, { type ModuleKey } from '@/device.config';

const TABS: { href: string; label: string; icon: typeof HomeIcon; module?: ModuleKey }[] = [
  { href: '/settings/general', label: 'General', icon: HomeIcon },
  { href: '/settings/display', label: 'Layout', icon: LayoutDashboardIcon },
  { href: '/settings/users', label: 'Users', icon: UsersIcon },
  { href: '/settings/security', label: 'Security', icon: ShieldIcon, module: 'security' },
  { href: '/settings/hardware', label: 'Hardware', icon: CpuIcon, module: 'hardware' },
  { href: '/settings/print-templates', label: 'Templates', icon: FileTextIcon, module: 'print' },
  { href: '/settings/receipt', label: 'Receipt', icon: ReceiptIcon, module: 'print' },
  { href: '/settings/integrations', label: 'Integrations', icon: PlugIcon, module: 'integration' },
  { href: '/settings/datahub', label: 'Data Hub', icon: CloudIcon, module: 'datahub' },
  { href: '/settings/testing', label: 'Testing', icon: FlaskConical, module: 'testing' },
  { href: '/settings/cloud-sync', label: 'Cloud Sync', icon: CloudSyncIcon, module: 'cloud' },
  { href: '/settings/ai-voice', label: 'Ai Voice', icon: MicIcon, module: 'aiVoice' },
  { href: '/settings/realtime', label: 'Realtime', icon: RadioIcon, module: 'realtime' },
  { href: '/settings/push', label: 'Push (FCM)', icon: BellIcon, module: 'push' },
  { href: '/settings/backup', label: 'Backup', icon: SaveIcon, module: 'backup' },
  { href: '/settings/retention', label: 'Data Retention', icon: ArchiveIcon, module: 'retention' },
  { href: '/settings/appearance', label: 'Appearance', icon: SparklesIcon },
  { href: '/settings/about', label: 'About', icon: InfoIcon },
];

const visibleTabs = TABS.filter((tab) => !tab.module || deviceConfig.modules[tab.module]);

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Deep link to a tab that isn't shipped for this build target → fall back.
  const activeTab = visibleTabs.find((tab) => pathname === tab.href || pathname.startsWith(`${tab.href}/`));
  if (!activeTab && pathname !== '/settings') {
    const gated = TABS.find((tab) => !visibleTabs.includes(tab) && (pathname === tab.href || pathname.startsWith(`${tab.href}/`)));
    if (gated) redirect('/settings/general');
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6" data-testid="settings-page">
      <div className="flex items-center gap-2">
        <SettingsIcon className="size-5 text-muted-foreground" />
        <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
      </div>

      <nav className="flex flex-wrap gap-1 border-b" data-testid="settings-tabs">
        {visibleTabs.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              data-testid={`tab-${tab.label.toLowerCase()}`}
              className={cn(
                'flex items-center gap-2 border-b-2 border-transparent px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'border-primary text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <tab.icon className="size-4" />
              {tab.label}
            </Link>
          );
        })}
      </nav>

      <div>{children}</div>
    </div>
  );
}
