'use client';

// Bottom sheet listing the nav items that don't fit the primary bottom-nav
// tabs (same permission/module filtering as the sidebar). Closes on navigate.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { navItemsForTarget } from '@/app/nav.config';
import { useAuthStore } from '@/stores/auth';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

export default function MoreSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const pathname = usePathname();
  const can = useAuthStore((s) => s.can);
  const items = navItemsForTarget().filter(
    (item) => !item.mobile && (!item.permission || can(item.permission))
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" data-testid="more-sheet">
        <SheetHeader>
          <SheetTitle>More</SheetTitle>
        </SheetHeader>
        <nav className="grid gap-1 overflow-y-auto px-4 pb-4">
          {items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                data-testid={`nav-${item.href}`}
                onClick={() => onOpenChange(false)}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium',
                  active ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted'
                )}
              >
                <item.icon className="size-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
