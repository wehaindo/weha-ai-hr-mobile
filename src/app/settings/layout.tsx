'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PrinterIcon, SettingsIcon, SparklesIcon, UsersIcon, InfoIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

const TABS = [
  { href: '/settings/users', label: 'Users', icon: UsersIcon },
  { href: '/settings/printers', label: 'Printers', icon: PrinterIcon },
  { href: '/settings/appearance', label: 'Appearance', icon: SparklesIcon },
  { href: '/settings/about', label: 'About', icon: InfoIcon },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="mx-auto max-w-4xl space-y-6" data-testid="settings-page">
      <div className="flex items-center gap-2">
        <SettingsIcon className="size-5 text-muted-foreground" />
        <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
      </div>

      <nav className="flex flex-wrap gap-1 border-b" data-testid="settings-tabs">
        {TABS.map((tab) => {
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
