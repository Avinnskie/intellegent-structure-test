import { UserManager } from "@/components/admin/user-manager";
import { AppShell } from "@/components/ui/app-shell";
import { getDb } from "@/lib/db/client.ts";
import { requireHrUser } from "@/lib/server/authz.ts";
import { listPortalUsers } from "@/lib/server/users.ts";

export default async function AdminUsersPage() {
  const db = getDb();
  const ctx = await requireHrUser(db);
  const users = await listPortalUsers(db, ctx);

  return (
    <AppShell title="Pengguna portal">
      <UserManager users={users} selfId={ctx.userId} />
    </AppShell>
  );
}
