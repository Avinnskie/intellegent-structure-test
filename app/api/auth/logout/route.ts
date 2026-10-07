import { withApiHandler } from "@/lib/api/errors";
import { getDb } from "@/lib/db/client";
import { createSupabaseServerClient } from "@/lib/providers/supabase-server";
import { writeAudit } from "@/lib/server/audit";
import { assertSameOrigin, resolveHrUser } from "@/lib/server/authz";
import { logError, logInfo } from "@/lib/server/logger";

export const POST = withApiHandler(async (request: Request) => {
  assertSameOrigin(request);

  const db = getDb();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();

  if (data.user) {
    const userId = data.user.id;
    const context = await resolveHrUser(db, userId).catch(() => null);
    await writeAudit(db, {
      organizationId: context?.organizationId ?? null,
      actorType: "user",
      actorId: userId,
      action: "auth.logout",
      objectType: "user",
      objectId: userId,
    }).catch((caught: unknown) => {
      logError("auth_logout_audit_failed", { userId }, caught);
    });
    logInfo("auth_logout", { userId });
  }

  await supabase.auth.signOut();
  return Response.redirect(new URL("/login", request.url), 303);
});
