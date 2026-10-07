import { redirect } from "next/navigation";
import { SubtestReview } from "@/components/participant/subtest-review";
import { getDb } from "@/lib/db/client.ts";
import { getUnanswered } from "@/lib/server/participant-responses.ts";
import { getSessionState } from "@/lib/server/participant-session.ts";

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ token: string; subtest: string }>;
}) {
  const { token, subtest } = await params;
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

  let unanswered;
  try {
    unanswered = await getUnanswered(db, token, subtest);
  } catch {
    redirect(state.nextRoute);
  }

  const pending = unanswered.items.map((item) => ({
    localNumber: item.localNumber,
    status: item.status === "skipped" ? ("skipped" as const) : ("unanswered" as const),
  }));
  const code = state.currentSubtest.code;

  return <SubtestReview token={token} code={code} serverPending={pending} />;
}
