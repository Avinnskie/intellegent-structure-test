import { PortalShell } from "@/components/ui/portal-shell";
import { requirePortalUser } from "@/lib/server/portal-guard";

export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await requirePortalUser("super_admin");

  return (
    <PortalShell mode="admin" displayName={user.displayName} role={user.role}>
      {children}
    </PortalShell>
  );
}
