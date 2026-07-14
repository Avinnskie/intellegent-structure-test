import { AppShell } from "@/components/ui/app-shell";
import { TestSession } from "@/components/participant/test-session";

export default async function SessionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = await searchParams;
  const subtestCode =
    typeof resolvedSearchParams.subtest === "string" ? resolvedSearchParams.subtest : null;

  return (
    <AppShell title="Kerjakan subtes aktif">
      <TestSession key={subtestCode ?? "SE"} subtestCode={subtestCode} />
    </AppShell>
  );
}
