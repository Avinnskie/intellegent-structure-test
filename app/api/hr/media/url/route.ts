import { withApiHandler } from "@/lib/api/errors.ts";
import { getDb } from "@/lib/db/client.ts";
import { createSupabaseStorageProvider } from "@/lib/providers/storage.ts";
import { requireHrUser } from "@/lib/server/authz.ts";
import { signMediaUrl } from "@/lib/server/media.ts";

/** Short-lived signed URL for portal PREVIEW of an uploaded media path (HR-only). */
export const GET = withApiHandler(async (request: Request) => {
  await requireHrUser(getDb());
  const path = new URL(request.url).searchParams.get("path") ?? "";
  const url = await signMediaUrl(createSupabaseStorageProvider(), path, "preview");
  return Response.json({ url }, { headers: { "cache-control": "no-store" } });
});
