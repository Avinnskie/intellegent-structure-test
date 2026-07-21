/** Where a login with no `next` lands, and the fallback for any `next` we refuse. */
export const DEFAULT_DESTINATION = "/hr";

/** The only areas `proxy.ts` guards, and therefore the only places a login is allowed to land. */
const ALLOWED_NEXT_PREFIXES = ["/hr", "/admin"] as const;

/**
 * Sanitizes the post-login `next` destination.
 *
 * `next` arrives from the query string — it is attacker-controlled, and it is about to be handed to
 * `redirect()`. Anything not provably one of our own protected areas is DISCARDED rather than
 * repaired: an allowlist of exact path prefixes cannot be talked into an off-site redirect, whereas
 * a blocklist has to anticipate every spelling of "elsewhere" ("//evil.test" and "/\evil.test" are
 * both protocol-relative to a browser; "https://evil.test" needs no trick at all).
 *
 * Lives outside `app/login/actions.ts` because a "use server" module may only export async
 * functions — and because a redirect guard is worth testing on its own.
 */
export function safeNextPath(raw: string | null | undefined): string {
  if (!raw) return DEFAULT_DESTINATION;

  const allowed = ALLOWED_NEXT_PREFIXES.some(
    (prefix) => raw === prefix || raw.startsWith(`${prefix}/`),
  );
  return allowed ? raw : DEFAULT_DESTINATION;
}
