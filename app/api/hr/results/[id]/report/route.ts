import { withApiHandler } from "@/lib/api/errors.ts";
import { getDb } from "@/lib/db/client.ts";
import { createSupabaseStorageProvider } from "@/lib/providers/storage.ts";
import { assertSameOrigin, requireHrUser } from "@/lib/server/authz.ts";
import { generateReport, getReportDownload } from "@/lib/server/reports.ts";

export const POST = withApiHandler(
  async (request: Request, ctx: RouteContext<"/api/hr/results/[id]/report">) => {
    assertSameOrigin(request);
    const { id } = await ctx.params;
    const auth = await requireHrUser(getDb());
    return Response.json(
      await generateReport(getDb(), createSupabaseStorageProvider(), auth, id),
      { status: 201 },
    );
  },
);

export const GET = withApiHandler(
  async (request: Request, ctx: RouteContext<"/api/hr/results/[id]/report">) => {
    const { id } = await ctx.params;
    const auth = await requireHrUser(getDb());
    const download = await getReportDownload(getDb(), createSupabaseStorageProvider(), auth, id);
    return Response.redirect(download.url, 302);
  },
);
