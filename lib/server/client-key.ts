import { getServerConfig } from "../config.ts";

const SHARED_BUCKET = "unknown";

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
    const depth = config.TRUSTED_PROXY_DEPTH ?? 1;
    return entries[entries.length - depth] ?? SHARED_BUCKET;
  }

  return entries[0] ?? SHARED_BUCKET;
}
