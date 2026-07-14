import { PortalShell } from "@/components/ui/portal-shell";

export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <PortalShell mode="admin">{children}</PortalShell>;
}
