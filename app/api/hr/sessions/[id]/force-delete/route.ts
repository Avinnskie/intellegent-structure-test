import { withApiHandler } from "@/lib/api/errors.ts";
import { getDb } from "@/lib/db/client.ts";
import { assertSameOrigin, requireHrUser } from "@/lib/server/authz.ts";
import { forceDeleteSession } from "@/lib/server/hr.ts";

/**
 * Rute terpisah dari `DELETE /api/hr/sessions/[id]`, bukan sekadar parameter
 * tambahan padanya.
 *
 * Penghapusan biasa menolak sesi yang sudah berjalan — penolakan itu adalah
 * pengamannya. Kalau paksa hanya berupa flag pada rute yang sama, satu salah
 * ketik pada pemanggilan bisa berubah menjadi penghapusan riwayat assessment.
 * Alamat yang berbeda membuat niatnya tidak mungkin tertukar.
 */
export const POST = withApiHandler(
  // Tipe parameter ditulis eksplisit, bukan `RouteContext<...>`. Tipe itu baru
  // ada setelah Next membuat ulang `.next/types`, sehingga rute yang baru
  // ditambahkan gagal type-check sampai build pertama dijalankan.
  async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
    assertSameOrigin(request);
    const { id } = await ctx.params;
    const auth = await requireHrUser(getDb());
    return Response.json(await forceDeleteSession(getDb(), auth, id));
  },
);
