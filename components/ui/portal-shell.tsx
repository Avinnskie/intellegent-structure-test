"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PrototypeBadge } from "@/components/ui/prototype-badge";

type PortalNavItem = {
  readonly href: string;
  readonly label: string;
  readonly shortLabel: string;
};

type PortalShellProps = {
  readonly mode: "hr" | "admin";
  readonly children: React.ReactNode;
};

const hrItems = [
  { href: "/hr", label: "Beranda", shortLabel: "01" },
  { href: "/hr/participants", label: "Peserta", shortLabel: "02" },
  { href: "/hr/sessions", label: "Sesi assessment", shortLabel: "03" },
  { href: "/hr/scoring/SES-018/ge", label: "Penilaian GE", shortLabel: "04" },
  { href: "/hr/results/SES-018", label: "Hasil & laporan", shortLabel: "05" },
  { href: "/hr/tutorials", label: "Tutorial subtes", shortLabel: "06" },
  { href: "/hr/question-bank", label: "Bank soal", shortLabel: "07" },
] as const satisfies readonly PortalNavItem[];

const adminItems = [
  { href: "/admin/users", label: "Pengguna HR", shortLabel: "01" },
  { href: "/admin/tutorials", label: "Tutorial subtes", shortLabel: "02" },
  { href: "/admin/question-bank", label: "Bank soal", shortLabel: "03" },
  { href: "/admin/audit", label: "Audit log", shortLabel: "04" },
  { href: "/hr", label: "Portal HR", shortLabel: "05" },
] as const satisfies readonly PortalNavItem[];

function isActive(pathname: string, href: string) {
  return href === "/hr" ? pathname === href : pathname.startsWith(href);
}

export function PortalShell({ mode, children }: PortalShellProps) {
  const pathname = usePathname();
  const items = mode === "hr" ? hrItems : adminItems;
  const title = mode === "hr" ? "IST Learning Hub" : "IST System Admin";

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
          <Link href={mode === "hr" ? "/hr" : "/admin/users"} className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-[var(--accent-primary)] text-sm font-bold text-white shadow-[var(--shadow-subtle)]">
              IS
            </span>
            <span>
              <span className="block text-sm font-bold tracking-[-0.02em] text-[var(--text-primary)]">
                {title}
              </span>
              <span className="block text-xs text-[var(--text-muted)]">Assessment workspace</span>
            </span>
          </Link>
          <div className="lg:mt-6">
            <PrototypeBadge tone="info">Prototype</PrototypeBadge>
          </div>
        </div>

        <nav
          aria-label="Navigasi utama"
          className="flex gap-2 overflow-x-auto px-4 pb-4 lg:block lg:space-y-1 lg:px-3"
        >
          {items.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex shrink-0 items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold ${active ? "bg-[var(--accent-soft)] text-[var(--accent-primary)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)]"}`}
              >
                <span
                  className={`grid size-7 place-items-center rounded-lg font-mono text-[0.68rem] ${active ? "bg-[var(--accent-primary)] text-white" : "bg-[var(--surface-subtle)] text-[var(--text-muted)]"}`}
                >
                  {item.shortLabel}
                </span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden lg:absolute lg:bottom-0 lg:left-0 lg:right-0 lg:block lg:border-t lg:border-[var(--border-subtle)] lg:p-5">
          <p className="text-xs font-semibold text-[var(--text-primary)]">Arunika People Lab</p>
          <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">
            Data fiktif untuk validasi flow.
          </p>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="flex min-h-16 items-center justify-between border-b border-[var(--border-default)] bg-[color-mix(in_srgb,var(--surface-panel)_86%,transparent)] px-4 backdrop-blur sm:px-6 lg:px-8">
          <div>
            <p className="text-xs font-semibold text-[var(--text-muted)]">Senin, 13 Juli 2026</p>
            <p className="text-sm font-bold text-[var(--text-primary)]">Ruang kerja assessment</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-right sm:block">
              <span className="block text-sm font-semibold text-[var(--text-primary)]">
                Alya Rahman
              </span>
              <span className="block text-xs text-[var(--text-muted)]">HR Administrator</span>
            </span>
            <span className="grid size-10 place-items-center rounded-xl bg-[var(--accent-warm-soft)] text-sm font-bold text-[var(--text-primary)]">
              AR
            </span>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
