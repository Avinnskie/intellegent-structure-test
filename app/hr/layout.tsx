import { PortalShell } from "@/components/ui/portal-shell";
import { requirePortalUser } from "@/lib/server/portal-guard";

export default async function HrLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await requirePortalUser();

  return (
    <PortalShell mode="hr" displayName={user.displayName} role={user.role}>
      {children}
    </PortalShell>
  );
}
