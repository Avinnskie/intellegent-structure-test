import { SUBTEST_CODES, subtests, type SubtestCode } from "./ist-subtests.ts";

export type AnswerOption = {
  readonly id: "a" | "b" | "c" | "d" | "e";
  readonly label: string;
};

type QuestionBase = {
  readonly subtestCode: SubtestCode;
  readonly localNumber: number;
  readonly globalNumber: number;
  readonly prompt: string;
};

export type IstQuestion =
  | (QuestionBase & {
      readonly kind: "choice";
      readonly options: readonly AnswerOption[];
      readonly visualDescription: string | null;
    })
  | (QuestionBase & {
      readonly kind: "short-text";
      readonly placeholder: string;
    })
  | (QuestionBase & {
      readonly kind: "numeric";
      readonly placeholder: string;
    });

type QuestionFactory = (localNumber: number, globalNumber: number) => IstQuestion;

function makeOptions(labels: readonly [string, string, string, string, string]): AnswerOption[] {
  return [
    { id: "a", label: labels[0] },
    { id: "b", label: labels[1] },
    { id: "c", label: labels[2] },
    { id: "d", label: labels[3] },
    { id: "e", label: labels[4] },
  ];
}

const questionFactories: Readonly<Record<SubtestCode, QuestionFactory>> = {
  SE: (localNumber, globalNumber) => ({
    kind: "choice",
    subtestCode: "SE",
    localNumber,
    globalNumber,
    prompt: `Lengkapi kalimat dummy ${localNumber}: “Sebuah keputusan yang baik dibuat secara ...”`,
    visualDescription: null,
    options: makeOptions(["tergesa-gesa", "terukur", "acak", "diam-diam", "sesaat"]),
  }),
  WA: (localNumber, globalNumber) => ({
    kind: "choice",
    subtestCode: "WA",
    localNumber,
    globalNumber,
    prompt: `Pilih satu kata yang tidak sekelompok pada set dummy ${localNumber}.`,
    visualDescription: null,
    options: makeOptions(["apel", "mangga", "jeruk", "pisang", `meja ${localNumber}`]),
  }),
  AN: (localNumber, globalNumber) => ({
    kind: "choice",
    subtestCode: "AN",
    localNumber,
    globalNumber,
    prompt: `Lengkapi analogi dummy ${localNumber}: “Guru : murid = dokter : ...”`,
    visualDescription: null,
    options: makeOptions(["pasien", "kelas", "buku", "sekolah", "papan"]),
  }),
  GE: (localNumber, globalNumber) => ({
    kind: "short-text",
    subtestCode: "GE",
    localNumber,
    globalNumber,
    prompt: `Tuliskan satu kategori umum untuk pasangan dummy “objek ${localNumber}A” dan “objek ${localNumber}B”.`,
    placeholder: "Tulis satu kata atau frasa singkat...",
  }),
  RA: (localNumber, globalNumber) => ({
    kind: "numeric",
    subtestCode: "RA",
    localNumber,
    globalNumber,
    prompt: `Soal hitung dummy ${localNumber}: sebuah tim memiliki ${localNumber + 8} berkas lalu menerima ${localNumber + 4} berkas lagi. Berapa jumlahnya?`,
    placeholder: "Masukkan jawaban angka...",
  }),
  ZR: (localNumber, globalNumber) => ({
    kind: "numeric",
    subtestCode: "ZR",
    localNumber,
    globalNumber,
    prompt: `Lanjutkan deret dummy ${localNumber}: ${localNumber}, ${localNumber + 3}, ${localNumber + 6}, ${localNumber + 9}, ...`,
    placeholder: "Masukkan angka berikutnya...",
  }),
  FA: (localNumber, globalNumber) => ({
    kind: "choice",
    subtestCode: "FA",
    localNumber,
    globalNumber,
    prompt: `Bayangkan tiga potongan geometris pada ilustrasi dummy ${localNumber} dirakit. Pilih bentuk hasilnya.`,
    visualDescription: `Ilustrasi dummy ${localNumber}: tiga potongan sederhana berupa segitiga, persegi panjang, dan setengah lingkaran.`,
    options: makeOptions(["Bentuk A", "Bentuk B", "Bentuk C", "Bentuk D", "Bentuk E"]),
  }),
  WU: (localNumber, globalNumber) => ({
    kind: "choice",
    subtestCode: "WU",
    localNumber,
    globalNumber,
    prompt: `Kubus dummy ${localNumber} memiliki sisi bertanda lingkaran, garis, dan titik. Pilih posisi yang sama setelah diputar.`,
    visualDescription: `Ilustrasi dummy ${localNumber}: kubus acuan menampilkan lingkaran di atas, garis di depan, dan titik di sisi kanan.`,
    options: makeOptions(["Kubus A", "Kubus B", "Kubus C", "Kubus D", "Kubus E"]),
  }),
  ME: (localNumber, globalNumber) => ({
    kind: "choice",
    subtestCode: "ME",
    localNumber,
    globalNumber,
    prompt: `Kata ingatan dummy nomor ${localNumber} termasuk kategori apa?`,
    visualDescription: null,
    options: makeOptions(["Benda", "Hewan", "Tumbuhan", "Profesi", "Tempat"]),
  }),
};

function buildSubtestQuestions(code: SubtestCode): readonly IstQuestion[] {
  const subtest = subtests.find((candidate) => candidate.code === code);

  if (!subtest) {
    return [];
  }

  return Array.from({ length: subtest.itemCount }, (_, index) => {
    const localNumber = index + 1;
    return questionFactories[code](localNumber, subtest.startItem + index);
  });
}

export const questionsBySubtest: Readonly<Record<SubtestCode, readonly IstQuestion[]>> = {
  SE: buildSubtestQuestions("SE"),
  WA: buildSubtestQuestions("WA"),
  AN: buildSubtestQuestions("AN"),
  GE: buildSubtestQuestions("GE"),
  RA: buildSubtestQuestions("RA"),
  ZR: buildSubtestQuestions("ZR"),
  FA: buildSubtestQuestions("FA"),
  WU: buildSubtestQuestions("WU"),
  ME: buildSubtestQuestions("ME"),
};

export const allQuestions = SUBTEST_CODES.flatMap((code) => questionsBySubtest[code]);

export function getQuestion(code: SubtestCode, localNumber: number): IstQuestion | null {
  if (!Number.isInteger(localNumber) || localNumber < 1) {
    return null;
  }

  return questionsBySubtest[code][localNumber - 1] ?? null;
}

export function canSubmitQuestionResponse(question: IstQuestion, value: string): boolean {
  const normalizedValue = value.trim();

  if (question.kind === "numeric") {
    return /^-?\d+(?:[.,]\d+)?$/.test(normalizedValue);
  }

  return normalizedValue.length > 0;
}
