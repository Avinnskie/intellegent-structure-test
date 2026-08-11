import { createHmac, randomInt } from "node:crypto";

export const ACCESS_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

const ACCESS_CODE_LENGTH = 8;
const ACCESS_CODE_PREFIX = "IST-";
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

/**
 * Kode akses ditampilkan utuh kepada HR.
 *
 * Sebelumnya nilai ini disamarkan (`IST-AB••••CD`) sehingga kode hanya terbaca
 * sekali saat dibuat. Kini kolom `access_codes.code_masked` menyimpan kode
 * lengkap agar HR dapat membacanya kembali kapan saja.
 *
 * Konsekuensinya kode dapat dibaca siapa pun yang punya akses ke database.
 * Kode hanya berlaku untuk mengerjakan tes sebagai kandidat bersangkutan,
 * punya masa berlaku, dan dapat dicabut — tetapi jejak hash-only hilang.
 */
export function displayAccessCode(code: string): string {
  return normalizeAccessCode(code);
}
