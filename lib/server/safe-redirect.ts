export const DEFAULT_DESTINATION = "/hr";

const ALLOWED_NEXT_PREFIXES = ["/hr", "/admin"] as const;

export function safeNextPath(raw: string | null | undefined): string {
  if (!raw) return DEFAULT_DESTINATION;

  const allowed = ALLOWED_NEXT_PREFIXES.some(
    (prefix) => raw === prefix || raw.startsWith(`${prefix}/`),
  );
  return allowed ? raw : DEFAULT_DESTINATION;
}
