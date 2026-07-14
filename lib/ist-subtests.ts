export const SUBTEST_CODES = ["SE", "WA", "AN", "GE", "RA", "ZR", "FA", "WU", "ME"] as const;

export type SubtestCode = (typeof SUBTEST_CODES)[number];

export type QuestionKind = "choice" | "short-text" | "numeric";

export type Subtest = {
  readonly code: SubtestCode;
  readonly groupLabel: string;
  readonly title: string;
  readonly startItem: number;
  readonly itemCount: number;
  readonly durationMinutes: number;
  readonly questionKind: QuestionKind;
  readonly tutorialSummary: string;
  readonly examplePrompt: string;
  readonly hasVideo: boolean;
};

export const subtests = [
  {
    code: "SE",
    groupLabel: "Soal 01",
    title: "Satzergänzung (SE)",
    startItem: 1,
    itemCount: 20,
    durationMinutes: 6,
    questionKind: "choice",
    tutorialSummary: "Lengkapi kalimat dengan satu dari lima pilihan kata.",
    examplePrompt: "Contoh dummy: Rencana yang baik disusun secara ...",
    hasVideo: false,
  },
  {
    code: "WA",
    groupLabel: "Soal 02",
    title: "Wortauswahl (WA)",
    startItem: 21,
    itemCount: 20,
    durationMinutes: 6,
    questionKind: "choice",
    tutorialSummary: "Pilih satu kata yang tidak sekelompok dengan empat kata lainnya.",
    examplePrompt: "Contoh dummy: apel, mangga, jeruk, pisang, meja.",
    hasVideo: false,
  },
  {
    code: "AN",
    groupLabel: "Soal 03",
    title: "Analogien (AN)",
    startItem: 41,
    itemCount: 20,
    durationMinutes: 7,
    questionKind: "choice",
    tutorialSummary: "Lengkapi hubungan analogi dengan pasangan yang paling setara.",
    examplePrompt: "Contoh dummy: Guru : Murid = Dokter : ...",
    hasVideo: false,
  },
  {
    code: "GE",
    groupLabel: "Soal 04",
    title: "Gemeinsamkeiten (GE)",
    startItem: 61,
    itemCount: 16,
    durationMinutes: 8,
    questionKind: "short-text",
    tutorialSummary: "Tulis satu konsep umum yang mencakup kedua kata.",
    examplePrompt: "Contoh dummy: apel dan mangga termasuk ...",
    hasVideo: false,
  },
  {
    code: "RA",
    groupLabel: "Soal 05",
    title: "Rechenaufgaben (RA)",
    startItem: 77,
    itemCount: 20,
    durationMinutes: 10,
    questionKind: "numeric",
    tutorialSummary: "Selesaikan persoalan hitung dan masukkan jawaban angka.",
    examplePrompt: "Contoh dummy: 18 + 26 = ...",
    hasVideo: false,
  },
  {
    code: "ZR",
    groupLabel: "Soal 06",
    title: "Zahlenreihen (ZR)",
    startItem: 97,
    itemCount: 20,
    durationMinutes: 10,
    questionKind: "numeric",
    tutorialSummary: "Temukan pola deret lalu masukkan angka berikutnya.",
    examplePrompt: "Contoh dummy: 2, 4, 8, 16, ...",
    hasVideo: false,
  },
  {
    code: "FA",
    groupLabel: "Soal 07",
    title: "Figurenauswahl (FA)",
    startItem: 117,
    itemCount: 20,
    durationMinutes: 7,
    questionKind: "choice",
    tutorialSummary: "Bayangkan potongan dirakit, lalu pilih bentuk hasilnya.",
    examplePrompt: "Contoh dummy: pilih bentuk yang tersusun dari tiga potongan.",
    hasVideo: true,
  },
  {
    code: "WU",
    groupLabel: "Soal 08",
    title: "Würfelaufgaben (WU)",
    startItem: 137,
    itemCount: 20,
    durationMinutes: 9,
    questionKind: "choice",
    tutorialSummary: "Bayangkan kubus diputar, lalu pilih posisi yang sama.",
    examplePrompt: "Contoh dummy: pilih kubus yang identik setelah diputar.",
    hasVideo: true,
  },
  {
    code: "ME",
    groupLabel: "Soal 09",
    title: "Merkaufgaben (ME)",
    startItem: 157,
    itemCount: 20,
    durationMinutes: 9,
    questionKind: "choice",
    tutorialSummary: "Pilih kategori dari kata dummy yang sebelumnya diingat.",
    examplePrompt: "Contoh dummy: kata berawalan M tadi termasuk kategori apa?",
    hasVideo: false,
  },
] as const satisfies readonly Subtest[];

export const TOTAL_QUESTION_COUNT = subtests.reduce(
  (total, subtest) => total + subtest.itemCount,
  0,
);

export const TOTAL_DURATION_MINUTES = subtests.reduce(
  (total, subtest) => total + subtest.durationMinutes,
  0,
);
