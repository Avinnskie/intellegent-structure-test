import { createHmac, randomInt } from "node:crypto";

/**
 * Unambiguous alphabet: 0/O, 1/I/L are excluded so codes read aloud or copied
 * from paper cannot be mistyped.
 */
export const ACCESS_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

const ACCESS_CODE_LENGTH = 8;
const ACCESS_CODE_PREFIX = "IST-";
const MASK_VISIBLE_CHARS = 2;
const MASK_CHAR = "•";
const FULLY_MASKED_BODY = MASK_CHAR.repeat(4);

/**
 * An access code is a credential, so it is drawn from a CSPRNG (`randomInt`),
 * never `Math.random`.
 *
 * UNIQUENESS IS NOT GUARANTEED HERE. The keyspace is 31^8 (~2^39.6), so by the
 * birthday bound ~1M issued codes carry a ~0.06% chance of at least one
 * collision. Callers MUST rely on the unique index on the hashed-code column and
 * retry on conflict rather than assuming this generator returns a fresh code.
 */
export function generateAccessCode(): string {
  const body = Array.from(
    { length: ACCESS_CODE_LENGTH },
    () => ACCESS_CODE_ALPHABET[randomInt(ACCESS_CODE_ALPHABET.length)],
  ).join("");

  return `${ACCESS_CODE_PREFIX}${body}`;
}

export function normalizeAccessCode(input: string): string {
  return input.trim().toUpperCase();
}

/**
 * Peppered HMAC-SHA256 digest for storage and lookup. The pepper is passed in by
 * the caller (from `getServerConfig()`) to keep this module pure and testable.
 */
export function hashAccessCode(code: string, pepper: string): string {
  return createHmac("sha256", pepper).update(normalizeAccessCode(code)).digest("hex");
}

/**
 * Renders a code for display/logs without revealing enough to reuse it.
 *
 * Accepts untrusted input (T11 logs rejected codes), so it normalizes first — a
 * case-sensitive prefix strip would otherwise leak a lowercase prefix into the
 * body — and refuses to split a body that is too short: `slice(0, 2)` and
 * `slice(-2)` overlap below four characters, which would echo the body back
 * verbatim with no mask at all. Such a body is masked whole instead.
 *
 * The prefix is preserved only when the input actually had one, so a masked value
 * never implies an `IST-` code that was not supplied.
 */
export function maskAccessCode(code: string): string {
  const normalized = normalizeAccessCode(code);
  const hasPrefix = normalized.startsWith(ACCESS_CODE_PREFIX);
  const prefix = hasPrefix ? ACCESS_CODE_PREFIX : "";
  const body = hasPrefix ? normalized.slice(ACCESS_CODE_PREFIX.length) : normalized;

  if (body.length <= MASK_VISIBLE_CHARS * 2) {
    return `${prefix}${FULLY_MASKED_BODY}`;
  }

  const hidden = MASK_CHAR.repeat(body.length - MASK_VISIBLE_CHARS * 2);

  return `${prefix}${body.slice(0, MASK_VISIBLE_CHARS)}${hidden}${body.slice(-MASK_VISIBLE_CHARS)}`;
}
