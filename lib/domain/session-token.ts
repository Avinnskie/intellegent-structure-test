import { createHmac, randomBytes } from "node:crypto";

/** 32 bytes of CSPRNG entropy encodes to exactly 43 unpadded base64url chars. */
const SESSION_TOKEN_BYTES = 32;

/**
 * Opaque participant session token. Handed to the client once; only its HMAC
 * digest is stored server-side.
 */
export function generateSessionToken(): string {
  return randomBytes(SESSION_TOKEN_BYTES).toString("base64url");
}

/**
 * HMAC-SHA256 digest of a session token. The secret is passed in by the caller
 * (from `getServerConfig().SESSION_TOKEN_SECRET`) to keep this module pure.
 *
 * The token is hashed verbatim: it is machine-issued, so normalizing it would
 * widen the accepted token space.
 */
export function hashSessionToken(token: string, secret: string): string {
  return createHmac("sha256", secret).update(token).digest("hex");
}
