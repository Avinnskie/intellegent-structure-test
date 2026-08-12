import { redirect } from "next/navigation";
import { getDb } from "@/lib/db/client.ts";
import { getSessionState } from "@/lib/server/participant-session.ts";

/**
 * Pintu masuk sesi: mengantar peserta ke tahap yang sedang berlaku.
 *
 * Rute ini sebelumnya tidak ada, sehingga `/test/{token}` menghasilkan 404 —
 * padahal itu URL paling wajar untuk disimpan atau dibuka ulang peserta.
 *
 * Halaman ini tidak menampilkan apa pun. Ia hanya membaca status sesi dan
 * memantulkan ke `nextRoute`, satu-satunya tempat yang tahu tahap mana yang
 * benar. Dengan begitu perpindahan antar tahap tidak perlu menebak URL tujuan:
 * cukup arahkan ke sini. Bug "lanjut ke IST" sebelumnya lahir justru karena URL
 * tujuan ditulis tetap di komponen.
 */
export default async function SessionEntryPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  let state;
  try {
    state = await getSessionState(getDb(), token);
  } catch {
    redirect("/test");
  }

  redirect(state.nextRoute);
}
