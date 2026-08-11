"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpenCheck,
  ClipboardList,
  FileBarChart,
  GraduationCap,
  Home,
  LogOut,
  ScrollText,
  UserCog,
  Users,
} from "lucide-react";
import { signOut } from "@/app/login/actions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import type { UserRole } from "@/lib/server/authz";

type PortalNavItem = {
  readonly href: string;
  readonly label: string;
  readonly icon: React.ComponentType<{ className?: string }>;
};

type PortalShellProps = {
  readonly mode?: "hr" | "admin";
  readonly displayName: string;
  readonly role: UserRole;
  readonly children: React.ReactNode;
};

const roleLabels: Record<UserRole, string> = {
  hr_admin: "HR Administrator",
  super_admin: "Super Admin",
};

const workspaceItems = [
  { href: "/hr", label: "Beranda", icon: Home },
  { href: "/hr/participants", label: "Peserta", icon: Users },
  { href: "/hr/sessions", label: "Sesi assessment", icon: ClipboardList },
  { href: "/hr/results", label: "Hasil & laporan", icon: FileBarChart },
] as const satisfies readonly PortalNavItem[];

const contentItems = [
  { href: "/hr/tutorials", label: "Tutorial subtes", icon: GraduationCap },
  { href: "/hr/question-bank", label: "Bank soal IST", icon: BookOpenCheck },
  { href: "/hr/papi-question-bank", label: "Bank soal PAPI", icon: ClipboardList },
] as const satisfies readonly PortalNavItem[];

const adminItems = [
  { href: "/admin/users", label: "Pengguna HR", icon: UserCog },
  { href: "/admin/audit", label: "Audit log", icon: ScrollText },
] as const satisfies readonly PortalNavItem[];

function isActive(pathname: string, href: string) {
  return href === "/hr" ? pathname === href : pathname.startsWith(href);
}

function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

function NavGroup({
  label,
  items,
  pathname,
}: {
  readonly label: string;
  readonly items: readonly PortalNavItem[];
  readonly pathname: string;
}) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  isActive={active}
                  tooltip={item.label}
                  render={
                    <Link href={item.href} aria-current={active ? "page" : undefined}>
                      <div
                        className={`${active ? "text-brand" : "text-muted-foreground"} grid size-4 shrink-0 place-items-center`}
                      >
                        <Icon />
                      </div>
                      <span>{item.label}</span>
                    </Link>
                  }
                />
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function PortalShell({ displayName, role, children }: PortalShellProps) {
  const pathname = usePathname();

  return (
    <SidebarProvider>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-lg focus:bg-popover focus:px-4 focus:py-3"
      >
        Lewati ke konten
      </a>

      <Sidebar collapsible="icon">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                size="lg"
                render={
                  <Link href="/hr">
                    <div className="grid flex-1 text-left leading-tight">
                      <span className="truncate font-semibold">Dashboard Test</span>
                    </div>
                  </Link>
                }
              />
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          <NavGroup label="Workspace" items={workspaceItems} pathname={pathname} />
          <NavGroup label="Konten tes" items={contentItems} pathname={pathname} />
          {role === "super_admin" ? (
            <NavGroup label="Administrasi" items={adminItems} pathname={pathname} />
          ) : null}
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" tooltip={displayName} className="cursor-default">
                <Avatar className="size-8 rounded-lg">
                  <AvatarFallback className="rounded-lg">{initialsOf(displayName)}</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate font-medium">{displayName}</span>
                  <span className="truncate text-xs text-muted-foreground">{roleLabels[role]}</span>
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>

        <SidebarRail />
      </Sidebar>

      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2 border-b bg-background/85 px-4 backdrop-blur">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <span className="text-sm font-medium text-muted-foreground">{roleLabels[role]}</span>
          <form action={signOut} className="ml-auto">
            <Button type="submit" variant="outline" size="sm">
              <LogOut className="size-4" />
              Keluar
            </Button>
          </form>
        </header>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
