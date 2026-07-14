import { PortalShell } from "@/components/ui/portal-shell";

export default function HrLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <PortalShell mode="hr">{children}</PortalShell>;
}
