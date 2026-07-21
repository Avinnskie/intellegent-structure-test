import { withApiHandler } from "@/lib/api/errors.ts";
import { getDb } from "@/lib/db/client.ts";
import { createSupabaseStorageProvider } from "@/lib/providers/storage.ts";
import { assertSameOrigin, requireHrUser } from "@/lib/server/authz.ts";
import { generateReport, getReportDownload } from "@/lib/server/reports.ts";

/** POST: generate a new versioned PDF for a FINAL result. `[id]` is the RESULT id. */
export const POST = withApiHandler(
  async (request: Request, ctx: RouteContext<"/api/hr/results/[id]/report">) => {
    assertSameOrigin(request);
    // Next 16: `ctx.params` is a Promise.
    const { id } = await ctx.params;
    const auth = await requireHrUser(getDb());
    return Response.json(
      await generateReport(getDb(), createSupabaseStorageProvider(), auth, id),
      { status: 201 },
    );
  },
);

/**
 * GET: 302 to a short-lived signed URL. `[id]` here is the REPORT id (`?report=` from the history
 * table); the audit row is written before the redirect.
 */
export const GET = withApiHandler(
  async (request: Request, ctx: RouteContext<"/api/hr/results/[id]/report">) => {
    // Next 16: `ctx.params` is a Promise.
    const { id } = await ctx.params;
    const auth = await requireHrUser(getDb());
    const download = await getReportDownload(getDb(), createSupabaseStorageProvider(), auth, id);
    return Response.redirect(download.url, 302);
  },
);
