import { PortalShell } from "@/components/ui/portal-shell";
import { requirePortalUser } from "@/lib/server/portal-guard";

export default async function HrLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Gates ENTRY to /hr and full page loads — NOT every request: layouts do not re-render on
  // client-side navigation. Pages and Server Actions under /hr must re-check authorization at
  // their own data source rather than assume this ran. See the warning on `requireHrUser`.
  const user = await requirePortalUser();

  return (
    <PortalShell mode="hr" displayName={user.displayName} role={user.role}>
      {children}
    </PortalShell>
  );
}
