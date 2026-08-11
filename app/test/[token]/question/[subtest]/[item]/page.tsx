import { redirect } from "next/navigation";
import { TestSession } from "@/components/participant/test-session";
import { getDb } from "@/lib/db/client.ts";
import { createSupabaseStorageProvider } from "@/lib/providers/storage.ts";
import { signMediaUrlOrNull } from "@/lib/server/media.ts";
import { getSessionState } from "@/lib/server/participant-session.ts";
import { startSubtest } from "@/lib/server/participant-start.ts";

export default async function QuestionPage({
  params,
}: {
  params: Promise<{ token: string; subtest: string; item: string }>;
}) {
  const { token, subtest, item } = await params;
  const db = getDb();

  let state;
  try {
    state = await getSessionState(db, token);
  } catch {
    redirect("/test");
  }

  if (state.sessionStatus !== "question" || state.currentSubtest?.code !== subtest) {
    redirect(state.nextRoute);
  }

  let started;
  try {
    started = await startSubtest(db, token, subtest);
  } catch {
    let fresh;
    try {
      fresh = await getSessionState(db, token);
    } catch {
      redirect("/test");
    }
    redirect(fresh.nextRoute);
  }

  const localNumber = Number.parseInt(item, 10);
  const currentItem = started.items.find((entry) => entry.localNumber === localNumber);
  if (!Number.isInteger(localNumber) || !currentItem) {
    redirect(state.nextRoute);
  }

  const storage = createSupabaseStorageProvider();
  const signed = await Promise.all(
    started.items.map(async (entry) => {
      if (!entry.mediaReference) {
        return null;
      }
      const url = await signMediaUrlOrNull(storage, entry.mediaReference, "participant");
      return url ? ([entry.itemVersionId, url] as const) : null;
    }),
  );
  const mediaUrls = Object.fromEntries(signed.filter((pair) => pair !== null));

  return (
    <div className="w-full">
      <TestSession
        token={token}
        subtestCode={state.currentSubtest.code}
        totalItems={started.items.length}
        durationSeconds={state.currentSubtest.durationSeconds}
        items={started.items}
        statuses={state.items}
        currentLocal={localNumber}
        mediaUrls={mediaUrls}
        expiresAt={started.expiresAt}
        serverNow={started.serverNow}
      />
    </div>
  );
}
