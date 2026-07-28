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

  if (parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`${argumentName} bukan tanggal yang ada di kalender: "${value}".`);
  }

  return parsed;
}

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

export function calculateScoringAge(birthDateIso: string, testDateIso: string): number {
  const birthDate = parseCivilDate(birthDateIso, "birthDateIso");
  const testDate = parseCivilDate(testDateIso, "testDateIso");
  return testDate.getUTCFullYear() - birthDate.getUTCFullYear();
}
