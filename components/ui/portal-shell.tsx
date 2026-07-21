"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/login/actions";
import type { UserRole } from "@/lib/server/authz";
import { Menu, X } from "lucide-react";
import { useState } from "react";

type PortalNavItem = {
  readonly href: string;
  readonly label: string;
  readonly shortLabel: string;
};

type PortalShellProps = {
  /**
   * Legacy: the two portals now share ONE navigation. Kept optional so old call sites compile;
   * what varies is the ROLE, not the mode.
   */
  readonly mode?: "hr" | "admin";
  /** From the `users` row resolved by the layout's `requirePortalUser` — never client-supplied. */
  readonly displayName: string;
  readonly role: UserRole;
  readonly children: React.ReactNode;
};

const roleLabels: Record<UserRole, string> = {
  hr_admin: "HR Administrator",
  super_admin: "Super Admin",
};

/** One dashboard for both roles. */
const baseItems = [
  { href: "/hr", label: "Beranda", shortLabel: "01" },
  { href: "/hr/participants", label: "Peserta", shortLabel: "02" },
  { href: "/hr/sessions", label: "Sesi assessment", shortLabel: "03" },
  { href: "/hr/results", label: "Hasil & laporan", shortLabel: "04" },
  { href: "/hr/tutorials", label: "Tutorial subtes", shortLabel: "05" },
  { href: "/hr/question-bank", label: "Bank soal", shortLabel: "06" },
] as const satisfies readonly PortalNavItem[];

/** Visible only to super_admin. The /admin layout re-enforces the role server-side. */
const adminOnlyItems = [
  { href: "/admin/users", label: "Pengguna HR", shortLabel: "07" },
  { href: "/admin/audit", label: "Audit log", shortLabel: "08" },
] as const satisfies readonly PortalNavItem[];

function isActive(pathname: string, href: string) {
  return href === "/hr" ? pathname === href : pathname.startsWith(href);
}

export function PortalShell({ displayName, role, children }: PortalShellProps) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const items = role === "super_admin" ? [...baseItems, ...adminOnlyItems] : baseItems;
  const title = "IST Dashboard";

  return (
    <div className="min-h-[100dvh] lg:grid lg:grid-cols-[248px_1fr]">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-[var(--surface-panel)] focus:px-4 focus:py-3"
      >
        Lewati ke konten
      </a>
      <aside className="border-b border-[var(--border-default)] bg-[var(--surface-panel)] lg:sticky lg:top-0 lg:h-[100dvh] lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between px-4 py-4 lg:block lg:px-5 lg:py-6">
          <Link href="/hr" className="flex items-center gap-3">
            <span>
              <span className="block text-sm font-bold tracking-[-0.02em] text-[var(--text-primary)]">
                {title}
              </span>
              <span className="block text-xs text-[var(--text-muted)]">Assessment workspace</span>
            </span>
          </Link>
          <button
            type="button"
            aria-expanded={menuOpen}
            aria-controls="portal-mobile-menu"
            onClick={() => setMenuOpen((open) => !open)}
            className="relative z-50 inline-flex size-10 items-center justify-center rounded-xl border border-[var(--border-default)] bg-[var(--surface-panel)] text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)] lg:hidden"
          >
            <span className="sr-only">Buka menu navigasi</span>
            {menuOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
          </button>
        </div>

        <nav
          id="portal-mobile-menu"
          className={`${menuOpen ? "flex" : "hidden"} fixed inset-0 z-40 flex-col gap-2 bg-[var(--surface-panel)] px-6 pb-6 pt-24 lg:static lg:z-auto lg:flex lg:gap-0 lg:space-y-1 lg:px-3 lg:pb-4 lg:pt-0`}
        >
          {items.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold ${active ? "bg-[var(--accent-soft)] text-[var(--accent-primary)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)]"}`}
              >
                {item.label}
              </Link>
            );
          })}
          <form action={signOut}>
            <button
              type="submit"
              className={`w-full flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)]`}
            >
              Keluar
            </button>
          </form>
        </nav>
      </aside>
      <div className="min-w-0">
        <header className="flex min-h-16 items-center justify-end border-b border-[var(--border-default)] bg-[color-mix(in_srgb,var(--surface-panel)_86%,transparent)] px-4 backdrop-blur sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <span className="hidden text-right sm:block">
              <span className="block text-sm font-semibold text-[var(--text-primary)]">
                {displayName}
              </span>
              <span className="block text-xs text-[var(--text-muted)]">{roleLabels[role]}</span>
            </span>
            <form action={signOut}>
              <button
                type="submit"
                className="hidden md:inline-flex h-9 items-center rounded-lg border border-[var(--border-default)] px-3 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)]"
              >
                Keluar
              </button>
            </form>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
