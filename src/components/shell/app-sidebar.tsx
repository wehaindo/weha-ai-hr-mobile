'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { navItemsForTarget } from '@/app/nav.config';
import { useAuthStore } from '@/stores/auth';
import deviceConfig from '@/device.config';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
} from '@/components/ui/sidebar';
import UserAvatar from '@/auth/components/UserAvatar';

export default function AppSidebar() {
  const pathname = usePathname();
  const can = useAuthStore((s) => s.can);
  const user = useAuthStore((s) => s.user);

  const items = navItemsForTarget().filter((item) => !item.permission || can(item.permission));

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" tooltip={deviceConfig.brand.sidebarTitle}>
              {deviceConfig.brand.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={deviceConfig.brand.logo} alt="" className="size-8 rounded" />
              ) : (
                <div className="flex size-8 shrink-0 items-center justify-center rounded bg-primary text-xs font-bold text-primary-foreground">
                  {deviceConfig.brand.sidebarTitle.slice(0, 1)}
                </div>
              )}
              <span className="truncate text-sm font-semibold">{deviceConfig.brand.sidebarTitle}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup data-testid="sidebar-nav">
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      render={<Link href={item.href} data-testid={`nav-${item.href}`} />}
                      isActive={active}
                      tooltip={item.label}
                    >
                      <item.icon className="size-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {user && (
        <>
          <SidebarSeparator />
          <SidebarFooter>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton size="lg" tooltip={user.display_name}>
                  <UserAvatar name={user.display_name} avatarColor={user.avatar_color} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{user.display_name}</span>
                    <span className="block truncate text-xs capitalize text-muted-foreground">{user.role}</span>
                  </span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </>
      )}

      <SidebarRail />
    </Sidebar>
  );
}
