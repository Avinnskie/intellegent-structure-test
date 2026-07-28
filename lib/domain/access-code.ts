import { createHmac, randomInt } from "node:crypto";

export const ACCESS_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

const ACCESS_CODE_LENGTH = 8;
const ACCESS_CODE_PREFIX = "IST-";
const MASK_VISIBLE_CHARS = 2;
const MASK_CHAR = "•";
const FULLY_MASKED_BODY = MASK_CHAR.repeat(4);

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

export function hashAccessCode(code: string, pepper: string): string {
  return createHmac("sha256", pepper).update(normalizeAccessCode(code)).digest("hex");
}

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
