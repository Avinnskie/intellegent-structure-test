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

  // Only the CURRENT item's image is signed (one storage call per render, not twenty); fail-soft —
  // a storage hiccup shows the question without its image rather than breaking the test.
  const currentMediaUrl = await signMediaUrlOrNull(
    createSupabaseStorageProvider(),
    currentItem.mediaReference ?? null,
    "participant",
  );

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
        currentMediaUrl={currentMediaUrl}
        expiresAt={started.expiresAt}
        serverNow={started.serverNow}
      />
    </div>
  );
}
