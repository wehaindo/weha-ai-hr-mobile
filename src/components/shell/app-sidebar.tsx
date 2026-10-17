'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_ITEMS } from '@/app/nav.config';
import { useAuthStore } from '@/stores/auth';
import deviceConfig from '@/device.config';
import { cn } from '@/lib/utils';

export default function AppSidebar() {
  const pathname = usePathname();
  const can = useAuthStore((s) => s.can);
  const user = useAuthStore((s) => s.user);

  const items = NAV_ITEMS.filter((item) => !item.permission || can(item.permission));

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground">
      <div className="flex h-14 items-center gap-2 border-b px-4">
        {deviceConfig.brand.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={deviceConfig.brand.logo} alt="" className="h-7 w-7 rounded" />
        ) : (
          <div className="flex h-7 w-7 items-center justify-center rounded bg-primary text-xs font-bold text-primary-foreground">
            {deviceConfig.brand.sidebarTitle.slice(0, 1)}
          </div>
        )}
        <span className="truncate text-sm font-semibold">{deviceConfig.brand.sidebarTitle}</span>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-2" data-testid="sidebar-nav">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              data-testid={`nav-${item.href}`}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                active
                  ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                  : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground'
              )}
            >
              <item.icon className="size-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {user && (
        <div className="border-t px-4 py-3">
          <p className="truncate text-sm font-medium">{user.display_name}</p>
          <p className="truncate text-xs capitalize text-muted-foreground">{user.role}</p>
        </div>
      )}
    </aside>
  );
}
