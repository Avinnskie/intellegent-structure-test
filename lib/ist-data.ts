import { subtests } from "./ist-subtests.ts";

export { subtests } from "./ist-subtests.ts";
export type { Subtest, SubtestCode } from "./ist-subtests.ts";

export type AccessCodeStatus =
  "active" | "in_use" | "completed" | "expired" | "revoked" | "regenerated";

export const prototypeLabel = "Prototype only. Demo data is fictional.";

export const demoParticipant = {
  id: "P-0241",
  name: "Dimas Miftahul Arifin",
  birthDate: "2000-05-14",
  testDate: "2026-07-13",
  purpose: "Rekrutmen",
} as const;

export const demoSession = {
  id: "SES-IST-240713-018",
  organization: "IST Talent Lab",
  accessCode: "IST-7K4M9Q2D",
  accessStatus: "active",
  sessionStatus: "subtest_in_progress",
  currentSubtest: "SE",
  expiresAt: "2026-07-13T08:06:00.000Z",
} as const satisfies {
  readonly id: string;
  readonly organization: string;
  readonly accessCode: string;
  readonly accessStatus: AccessCodeStatus;
  readonly sessionStatus: string;
  readonly currentSubtest: string;
  readonly expiresAt: string;
};

export const hrMetrics = [
  { label: "Tes dibuat bulan ini", value: "42", detail: "9 di antaranya minggu ini" },
  { label: "Sesi aktif", value: "18", detail: "7 sedang mengerjakan" },
  { label: "Butuh GE", value: "6", detail: "item 61-76 menunggu scorer" },
  { label: "Laporan final", value: "12", detail: "siap diunduh oleh HR" },
] as const;

export const sessionRows = [
  {
    id: "SES-018",
    candidate: "Dimas Miftahul Arifin",
    status: "In progress",
    subtest: "SE",
    unanswered: 4,
    access: "IST-7K4M9Q2D",
  },
  {
    id: "SES-021",
    candidate: "Bima Kurnia",
    status: "Needs GE",
    subtest: "GE",
    unanswered: 0,
    access: "IST-3N8R6P5K",
  },
  {
    id: "SES-009",
    candidate: "Sari Lestari",
    status: "Final",
    subtest: "ME",
    unanswered: 0,
    access: "IST-5Q2L8T4M",
  },
] as const;

export const resultRows = [
  { code: "SE", rw: 16, sw: 108, category: "Above average" },
  { code: "WA", rw: 14, sw: 102, category: "Average" },
  { code: "AN", rw: 15, sw: 105, category: "Average" },
  { code: "GE", rw: 20, sw: 111, category: "Above average" },
  { code: "RA", rw: 13, sw: 100, category: "Average" },
  { code: "ZR", rw: 12, sw: 97, category: "Average" },
  { code: "FA", rw: 17, sw: 110, category: "Above average" },
  { code: "WU", rw: 18, sw: 112, category: "Above average" },
  { code: "ME", rw: 11, sw: 95, category: "Average" },
] as const;

export const participantRows = [
  {
    id: "P-0241",
    name: "Dimas Miftahul Arifin",
    birthDate: "2000-05-14",
    purpose: "Rekrutmen",
    sessionStatus: "In progress",
  },
  {
    id: "P-0242",
    name: "Bima Kurnia",
    birthDate: "1998-11-02",
    purpose: "Rekrutmen",
    sessionStatus: "Needs GE",
  },
  {
    id: "P-0236",
    name: "Sari Lestari",
    birthDate: "1995-03-27",
    purpose: "Pemetaan internal",
    sessionStatus: "Final",
  },
  {
    id: "P-0247",
    name: "Raka Wijaya",
    birthDate: "2001-09-08",
    purpose: "Rekrutmen",
    sessionStatus: "Belum ada sesi",
  },
] as const;

export const auditRows = [
  {
    time: "13 Jul 2026 09:41",
    actor: "Alya Rahman",
    action: "generate_access_code",
    object: "SES-018",
    detail: "Kode baru dibuat untuk Dimas Miftahul Arifin",
  },
  {
    time: "13 Jul 2026 09:52",
    actor: "system",
    action: "code_validated",
    object: "SES-018",
    detail: "Peserta masuk sesi via kode akses",
  },
  {
    time: "13 Jul 2026 10:14",
    actor: "system",
    action: "subtest_completed_timeout",
    object: "SES-018/SE",
    detail: "Timer SE habis, jawaban terkunci",
  },
  {
    time: "12 Jul 2026 16:20",
    actor: "Alya Rahman",
    action: "ge_score_saved",
    object: "SES-021",
    detail: "16 butir GE dinilai dengan rubrik 0/1/2",
  },
  {
    time: "12 Jul 2026 16:25",
    actor: "Alya Rahman",
    action: "result_finalized",
    object: "SES-009",
    detail: "Hasil dikunci; laporan siap diunduh",
  },
  {
    time: "12 Jul 2026 16:27",
    actor: "Alya Rahman",
    action: "report_downloaded",
    object: "RPT-009",
    detail: "Laporan final diunduh (hash tercatat)",
  },
] as const;

export const tutorialVersionRows = subtests.map((subtest) => ({
  code: subtest.code,
  title: subtest.title,
  version: `TUT-${subtest.code}-2026.07`,
  contentType: subtest.hasVideo ? "Teks + video" : "Teks",
  status: "published",
  effectiveDate: "2026-07-01",
}));

export type ResultStatus = "calculated" | "reviewed" | "final";

export const demoReport: {
  readonly id: string;
  readonly resultStatus: ResultStatus;
  readonly reportVersion: string;
  readonly fileHash: string;
  readonly generatedBy: string;
  readonly formVersion: string;
  readonly normVersion: string;
  readonly engineVersion: string;
} = {
  id: "RPT-018",
  resultStatus: "calculated",
  reportVersion: "1.0-draft",
  fileHash: "sha256:demo-4f2a9c…e81b",
  generatedBy: "Alya Rahman",
  formVersion: "FORM-2026.07",
  normVersion: "NORM-2026.02",
  engineVersion: "ENG-0.1",
};

export const geScoringRows = Array.from({ length: 16 }, (_, index) => ({
  itemNumber: index + 61,
  response: `Jawaban demo peserta untuk butir ${index + 61}`,
  rubricHint: "0 = tidak sesuai, 1 = cukup, 2 = tepat",
  score: index % 3,
}));
