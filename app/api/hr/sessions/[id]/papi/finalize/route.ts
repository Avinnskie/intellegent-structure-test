import { withApiHandler } from "@/lib/api/errors.ts";
import { getDb } from "@/lib/db/client.ts";
import { assertSameOrigin, requireHrUser } from "@/lib/server/authz.ts";
import { finalizePapiOnlyResult } from "@/lib/server/papi-results.ts";

export const POST = withApiHandler(
  // Tipe parameter eksplisit: `RouteContext` baru ada setelah Next membuat
  // ulang `.next/types`, sehingga rute baru gagal type-check sebelum build.
  async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
    assertSameOrigin(request);
    const { id } = await ctx.params;
    const auth = await requireHrUser(getDb());
    return Response.json(await finalizePapiOnlyResult(getDb(), auth, id));
  },
);
