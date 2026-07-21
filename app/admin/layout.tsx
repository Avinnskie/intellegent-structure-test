import { PortalShell } from "@/components/ui/portal-shell";
import { requirePortalUser } from "@/lib/server/portal-guard";

export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Same entry gate as /hr, plus the role: /admin is super_admin only. Like /hr, this does NOT run
  // on client-side navigation — pages and Server Actions under /admin must re-check the role
  // themselves. See the warning on `requireHrUser`.
  const user = await requirePortalUser("super_admin");

  return (
    <PortalShell mode="admin" displayName={user.displayName} role={user.role}>
      {children}
    </PortalShell>
  );
}
