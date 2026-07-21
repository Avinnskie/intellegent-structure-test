/**
 * Resolves the per-client rate-limit bucket for an inbound request.
 *
 * `X-Forwarded-For` is only as trustworthy as the proxy that sets it, and the two common
 * deployments disagree about WHICH END of the chain is real:
 *
 *   Vercel:  overwrites the header       -> "<real peer>"                      leftmost is real
 *   nginx:   proxy_add_x_forwarded_for   -> "<forged...>, <real peer>"         RIGHTMOST is real
 *            (APPENDS, so a caller can prepend anything it likes)
 *
 * Reading the leftmost entry behind an appending proxy hands the attacker the bucket key: they
 * increment a forged IP per request, every request opens a fresh window at count=1, and the limiter
 * is gone — silently, with every test still passing. So the deployment shape is a validated config
 * decision (`TRUSTED_PROXY_MODE`, see `lib/config.ts`) rather than a comment, and spec §5.5's
 * migration to a company reverse proxy has to choose one.
 */
import { getServerConfig } from "../config.ts";

/**
 * Shared bucket for callers we cannot attribute. NOT a bypass: an attacker who strips the header is
 * rate limited together with everyone else who has none, which fails closed.
 */
const SHARED_BUCKET = "unknown";

/** `peer` mode has no per-client signal at all, so the whole app shares one bucket. */
const PEER_BUCKET = "peer";

function forwardedForEntries(request: Request): string[] {
  return (request.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
}

export function clientKeyFrom(request: Request): string {
  const config = getServerConfig();

  if (config.TRUSTED_PROXY_MODE === "peer") {
    return PEER_BUCKET;
  }

  const entries = forwardedForEntries(request);

  if (config.TRUSTED_PROXY_MODE === "trusted-depth") {
    // Counted from the right, so prepended junk shifts the index without reaching the real entry.
    // The schema guarantees the depth is set in this mode; `?? 1` only keeps the type honest.
    const depth = config.TRUSTED_PROXY_DEPTH ?? 1;
    // A chain shorter than the configured depth means the request did not pass the proxies we were
    // told about. Fail closed to the shared bucket rather than trust whatever is there.
    return entries[entries.length - depth] ?? SHARED_BUCKET;
  }

  return entries[0] ?? SHARED_BUCKET;
}
