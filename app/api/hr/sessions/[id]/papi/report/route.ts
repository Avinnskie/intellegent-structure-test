import { withApiHandler } from "@/lib/api/errors.ts";
import { getDb } from "@/lib/db/client.ts";
import { requireHrUser } from "@/lib/server/authz.ts";
import { renderPapiOnlyReport } from "@/lib/server/papi-results.ts";

export const GET = withApiHandler(
  async (_request: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params;
    const auth = await requireHrUser(getDb());
    const { pdf, fileName } = await renderPapiOnlyReport(getDb(), auth, id);

    return new Response(new Uint8Array(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${fileName}"`,
        // Laporan tidak diarsipkan, jadi tidak boleh ada salinan basi di cache.
        "cache-control": "no-store",
      },
    });
  },
);
