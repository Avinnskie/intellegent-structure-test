import { AppShell } from "@/components/ui/app-shell";
import { TutorialScreen } from "@/components/participant/tutorial-screen";

export default async function TutorialPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = await searchParams;
  const subtestCode =
    typeof resolvedSearchParams.subtest === "string" ? resolvedSearchParams.subtest : null;
  const previousSubtest =
    typeof resolvedSearchParams.prev === "string" ? resolvedSearchParams.prev : null;
  const lockedSubtest =
    typeof resolvedSearchParams.locked === "string" ? resolvedSearchParams.locked : null;

  return (
    <AppShell title="Ikuti Instruksi dan contoh soal yang diberikan">
      <TutorialScreen
        previousSubtest={previousSubtest}
        subtestCode={subtestCode}
        lockedSubtest={lockedSubtest}
      />
    </AppShell>
  );
}
