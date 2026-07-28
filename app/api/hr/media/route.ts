import { ApiError, withApiHandler } from "@/lib/api/errors.ts";
import { getDb } from "@/lib/db/client.ts";
import { createSupabaseStorageProvider } from "@/lib/providers/storage.ts";
import { assertSameOrigin, requireHrUser } from "@/lib/server/authz.ts";
import { mediaKindSchema, uploadMedia } from "@/lib/server/media.ts";

export const POST = withApiHandler(async (request: Request) => {
  assertSameOrigin(request);
  const ctx = await requireHrUser(getDb());

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new ApiError("VALIDATION_ERROR", "Data yang dikirim tidak valid.", 422);
  }
  const kind = mediaKindSchema.parse(form.get("kind"));
  const file = form.get("file");
  if (!(file instanceof File)) {
    throw new ApiError("VALIDATION_ERROR", "Berkas tidak ditemukan pada permintaan.", 422);
  }

  return Response.json(
    await uploadMedia(getDb(), createSupabaseStorageProvider(), ctx, kind, file),
    { status: 201, headers: { "cache-control": "no-store" } },
  );
});
