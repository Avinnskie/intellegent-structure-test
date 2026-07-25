/** Date-only ISO calendar date, e.g. "2000-05-14". Deliberately excludes timestamps. */
const CIVIL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseCivilDate(value: string, argumentName: string): Date {
  if (!CIVIL_DATE_PATTERN.test(value)) {
    throw new Error(
      `${argumentName} harus tanggal kalender ISO (YYYY-MM-DD), bukan "${value}". ` +
        "Ubah timestamp menjadi tanggal lokal lokasi tes sebelum menghitung usia.",
    );
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${argumentName} bukan tanggal yang valid: "${value}".`);
  }

  // new Date("2000-02-30") is Invalid Date, but guard the round-trip anyway so no
  // rolled-over or out-of-range date can slip through as a plausible age.
  if (parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`${argumentName} bukan tanggal yang ada di kalender: "${value}".`);
  }

  return parsed;
}

/**
 * Completed chronological age for participant-facing display and general validation.
 *
 * CONTRACT: both arguments are CIVIL DATES ("YYYY-MM-DD"), never timestamps.
 * Converting an instant to the civil date of the test's local timezone is the
 * CALLER's responsibility (Task 27 does this for `assessment_sessions.started_at`).
 *
 * Why this is enforced rather than tolerated: a timestamp is parsed as an instant,
 * so its UTC calendar date can differ from the local civil date. In Asia/Jakarta
 * (UTC+7) any session started 00:00-07:00 WIB lands on the previous UTC date, which
 * would age a participant tested on their birthday a year young. Invalid input therefore throws
 * instead of silently returning NaN. IST scoring itself uses `calculateScoringAge`, matching the
 * workbook's distinct calendar-year convention.
 */
export function calculateExactAge(birthDateIso: string, testDateIso: string): number {
  const birthDate = parseCivilDate(birthDateIso, "birthDateIso");
  const testDate = parseCivilDate(testDateIso, "testDateIso");

  let age = testDate.getUTCFullYear() - birthDate.getUTCFullYear();
  const hasBirthdayPassed =
    testDate.getUTCMonth() > birthDate.getUTCMonth() ||
    (testDate.getUTCMonth() === birthDate.getUTCMonth() &&
      testDate.getUTCDate() >= birthDate.getUTCDate());

  if (!hasBirthdayPassed) {
    age -= 1;
  }

  return age;
}

/**
 * Age convention used by the reference Excel scorer: calendar-year difference only.
 *
 * This deliberately differs from completed chronological age. For example, 13 December 1996 to
 * 16 October 2019 is scored as age 23 in the workbook even though the birthday is still ahead.
 */
export function calculateScoringAge(birthDateIso: string, testDateIso: string): number {
  const birthDate = parseCivilDate(birthDateIso, "birthDateIso");
  const testDate = parseCivilDate(testDateIso, "testDateIso");
  return testDate.getUTCFullYear() - birthDate.getUTCFullYear();
}
