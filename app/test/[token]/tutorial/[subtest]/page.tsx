import { redirect } from "next/navigation";
import { TutorialScreen } from "@/components/participant/tutorial-screen";
import { getDb } from "@/lib/db/client.ts";
import { createSupabaseStorageProvider } from "@/lib/providers/storage.ts";
import { signMediaUrlOrNull } from "@/lib/server/media.ts";
import { getSessionState } from "@/lib/server/participant-session.ts";

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

  if (!state.currentSubtest || !state.tutorial) {
    throw new Error("Status tutorial tanpa konten subtes — state dan route tidak konsisten.");
  }

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
