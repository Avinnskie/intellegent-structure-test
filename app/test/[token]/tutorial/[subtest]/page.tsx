import { redirect } from "next/navigation";
import { TutorialScreen } from "@/components/participant/tutorial-screen";
import { getDb } from "@/lib/db/client.ts";
import { createSupabaseStorageProvider } from "@/lib/providers/storage.ts";
import { signMediaUrlOrNull } from "@/lib/server/media.ts";
import { getSessionState } from "@/lib/server/participant-session.ts";

/**
 * The tutorial gate for one subtest, driven entirely by the server's session state.
 *
 * `getSessionState` is called directly — no HTTP hop — and its `nextRoute` is the ONLY authority on
 * where this participant belongs. If this page is not that route (bookmarked URL, refresh after the
 * session advanced, a guessed subtest code), the participant is redirected there instead of being
 * shown a tutorial the state machine would refuse to start. That one rule is what makes
 * refresh/resume land correctly on every screen.
 *
 * An invalid or revoked token routes back to the code-entry page rather than an error: the token is
 * a credential, and which of "unknown/expired/revoked" applied is not the participant's to learn.
 */
export default async function TutorialPage({
  params,
}: {
  params: Promise<{ token: string; subtest: string }>;
}) {
  const { token, subtest } = await params;

  let state;
  try {
    state = await getSessionState(getDb(), token);
  } catch {
    redirect("/test");
  }

  if (state.nextRoute !== `/test/${token}/tutorial/${subtest}`) {
    redirect(state.nextRoute);
  }

  // `nextRoute` pointed here, so the state is `tutorial` and both blocks are present by
  // construction; the throw is a loud regression alarm, not a reachable path.
  if (!state.currentSubtest || !state.tutorial) {
    throw new Error("Status tutorial tanpa konten subtes — state dan route tidak konsisten.");
  }

  // The stored reference is a private-bucket path; sign it here (fail-soft: a storage hiccup
  // degrades to the text tutorial, never to a broken gate).
  const videoUrl = await signMediaUrlOrNull(
    createSupabaseStorageProvider(),
    state.tutorial.videoReference,
    "participant",
  );

  return (
    <TutorialScreen
      token={token}
      subtest={state.currentSubtest}
      tutorial={state.tutorial}
      videoUrl={videoUrl}
    />
  );
}
