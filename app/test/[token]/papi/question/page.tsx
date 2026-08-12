import { redirect } from "next/navigation";
import { PapiSession } from "@/components/participant/papi-session";
import { getDb } from "@/lib/db/client.ts";
import { getPapiState, startPapi } from "@/lib/server/papi-participant.ts";

export default async function PapiQuestionPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = getDb();

  let state;
  try {
    state = await getPapiState(db, token);
  } catch {
    redirect("/test");
  }

  if (state.sessionStatus === "papi_tutorial") {
    try {
      state = await startPapi(db, token);
    } catch {
      redirect(`/test/${token}/papi`);
    }
  }

  if (state.sessionStatus !== "papi_question") {
    redirect(state.nextRoute);
  }

  return (
    <PapiSession
      token={token}
      items={state.items}
      itemCount={state.itemCount}
      initialElapsedSeconds={state.elapsedSeconds}
    />
  );
}
