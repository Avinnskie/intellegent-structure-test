import { AppShell } from "@/components/ui/app-shell";
import { AccessEntry } from "@/components/participant/access-entry";

export default function Home() {
  return (
    <AppShell title="Akses assessment">
      <AccessEntry />
    </AppShell>
  );
}
