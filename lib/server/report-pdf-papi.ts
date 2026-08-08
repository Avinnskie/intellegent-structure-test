import { createElement as h, type ReactElement } from "react";
import { Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { formatPapiElapsed, papiCategoryLabel } from "../domain/papi-format.ts";
import { PAPI_MAX_FACTOR_SCORE } from "../papi-factors.ts";
import type { PapiResultDto, PapiStageDto } from "./papi-result-read.ts";

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#1a1a1a" },
  title: { fontSize: 18, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  subtitle: { fontSize: 10, color: "#555555", marginBottom: 14 },
  sectionTitle: { fontSize: 12, fontFamily: "Helvetica-Bold", marginTop: 16, marginBottom: 6 },
  note: {
    borderLeft: "3 solid #4657d9",
    backgroundColor: "#f4f5fd",
    padding: 8,
    fontSize: 9,
    lineHeight: 1.5,
    marginBottom: 10,
  },
  warning: {
    borderLeft: "3 solid #d99a46",
    backgroundColor: "#fdf8f1",
    padding: 8,
    fontSize: 9,
    lineHeight: 1.5,
    marginTop: 8,
  },
  identityRow: { flexDirection: "row" as const, marginBottom: 3 },
  identityLabel: { width: 130, color: "#555555" },

  chartArea: {
    flexDirection: "row" as const,
    alignItems: "flex-end" as const,
    height: 110,
    marginTop: 10,
    gap: 3,
  },
  chartCol: { flex: 1, alignItems: "center" as const },
  chartBar: {
    width: "100%",
    backgroundColor: "#4657d9",
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
  },
  chartValue: { fontSize: 7, marginBottom: 2 },
  chartLabel: { fontSize: 7, marginTop: 3, color: "#555555" },

  headRow: { flexDirection: "row" as const, borderBottom: "1.5 solid #333333", paddingVertical: 4 },
  row: { flexDirection: "row" as const, borderBottom: "1 solid #dddddd", paddingVertical: 4 },
  cellCode: { width: "8%", fontFamily: "Helvetica-Bold" },
  cellName: { width: "30%" },
  cellKind: { width: "9%", color: "#777777" },
  cellNum: { width: "8%", textAlign: "right" as const },
  cellCat: { width: "13%", paddingLeft: 6 },
  cellText: { width: "32%", paddingLeft: 6, fontSize: 8, lineHeight: 1.4 },

  groupWrap: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 8, marginTop: 8 },
  groupCard: {
    width: "31%",
    border: "1 solid #dddddd",
    borderRadius: 4,
    padding: 8,
  },
  groupTitle: { fontSize: 9, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  groupLine: { flexDirection: "row" as const, justifyContent: "space-between" as const },
  groupMeta: { fontSize: 8, color: "#777777", marginTop: 4 },

  versions: { marginTop: 14, fontSize: 8, color: "#777777" },
  footer: {
    position: "absolute",
    bottom: 32,
    left: 40,
    right: 40,
    fontSize: 8,
    color: "#777777",
    borderTop: "1 solid #dddddd",
    paddingTop: 8,
  },
});

const IPSATIVE_NOTE =
  "Skor PAPI bersifat ipsatif: total 20 faktor selalu 90, sehingga skor tinggi pada satu faktor " +
  "memaksa faktor lain turun. Profil ini hanya bermakna dibandingkan di dalam diri peserta " +
  "sendiri dan tidak sah dipakai untuk memeringkat kandidat atau sebagai ambang kelulusan.";

const FOOTER_TEXT =
  "Laporan ini tidak memuat keputusan otomatis diterima/ditolak. Interpretasi akhir menjadi" +
  " wewenang psikolog/HR yang berwenang.";

const KIND_LABELS: Record<string, string> = { role: "Role", need: "Need" };

function identityLine(label: string, value: string): ReactElement {
  return h(
    View,
    { style: styles.identityRow, key: label },
    h(Text, { style: styles.identityLabel }, label),
    h(Text, null, value),
  );
}

/** Halaman PAPI ketika peserta menyelesaikan seluruh 90 nomor. */
export function buildPapiPage(papi: PapiResultDto): ReactElement {
  const chartColumns = papi.factors.map((factor) =>
    h(
      View,
      { style: styles.chartCol, key: factor.code },
      h(Text, { style: styles.chartValue }, String(factor.score)),
      h(View, {
        style: [
          styles.chartBar,
          { height: Math.max((factor.score / PAPI_MAX_FACTOR_SCORE) * 85, 2) },
        ],
      }),
      h(Text, { style: styles.chartLabel }, factor.code),
    ),
  );

  const groupCards = papi.groups.map((group) =>
    h(
      View,
      { style: styles.groupCard, key: group.code },
      h(Text, { style: styles.groupTitle }, group.label),
      ...group.factors.map((factor) =>
        h(
          View,
          { style: styles.groupLine, key: factor.code },
          h(Text, null, `${factor.code} — ${papiCategoryLabel(factor.category)}`),
          h(Text, null, String(factor.score)),
        ),
      ),
      h(Text, { style: styles.groupMeta }, `Rata-rata ${group.average}`),
    ),
  );

  const tableRows = papi.factors.map((factor) =>
    h(
      View,
      { style: styles.row, key: factor.code, wrap: false },
      h(Text, { style: styles.cellCode }, factor.code),
      h(Text, { style: styles.cellName }, factor.name),
      h(Text, { style: styles.cellKind }, KIND_LABELS[factor.kind] ?? factor.kind),
      h(Text, { style: styles.cellNum }, String(factor.score)),
      h(Text, { style: styles.cellCat }, papiCategoryLabel(factor.category)),
      h(
        Text,
        { style: styles.cellText },
        factor.interpretation ?? "Belum tersedia — menunggu narasi psikolog.",
      ),
    ),
  );

  const pendingWarning =
    papi.pendingInterpretationFactors.length > 0
      ? h(
          Text,
          { style: styles.warning },
          `${papi.pendingInterpretationFactors.length} faktor (${papi.pendingInterpretationFactors.join(", ")}) ` +
            "berada pada rentang skor yang tidak memiliki teks interpretasi pada workbook sumber. " +
            "Rentang tersebut sengaja dibiarkan kosong, bukan diisi otomatis, dan wajib dilengkapi psikolog.",
        )
      : null;

  const children = [
    h(Text, { style: styles.title, key: "title" }, "Laporan Hasil PAPI Kostick"),
    h(
      Text,
      { style: styles.subtitle, key: "subtitle" },
      "Profil kepribadian kerja — 20 faktor, skala 0–9",
    ),
    identityLine("Nama", papi.candidate.fullName),
    identityLine(
      "Lama mengerjakan",
      `${formatPapiElapsed(papi.elapsedSeconds)} (tanpa batas waktu)`,
    ),
    identityLine("Role / Need", `${papi.roleTotal} / ${papi.needTotal}`),
    identityLine("Total skor", String(papi.totalScore)),
    h(Text, { style: styles.sectionTitle, key: "note-title" }, "Catatan pembacaan"),
    h(Text, { style: styles.note, key: "note" }, IPSATIVE_NOTE),
    h(Text, { style: styles.sectionTitle, key: "chart-title" }, "Profil 20 faktor"),
    h(View, { style: styles.chartArea, key: "chart" }, ...chartColumns),
    h(Text, { style: styles.sectionTitle, key: "group-title" }, "Ringkasan tujuh kelompok"),
    h(View, { style: styles.groupWrap, key: "groups" }, ...groupCards),
    h(Text, { style: styles.sectionTitle, key: "table-title" }, "Detail faktor"),
    h(
      View,
      { style: styles.headRow, key: "head" },
      h(Text, { style: styles.cellCode }, "Kode"),
      h(Text, { style: styles.cellName }, "Faktor"),
      h(Text, { style: styles.cellKind }, "Tipe"),
      h(Text, { style: styles.cellNum }, "Skor"),
      h(Text, { style: styles.cellCat }, "Kategori"),
      h(Text, { style: styles.cellText }, "Interpretasi"),
    ),
    ...tableRows,
  ];

  if (pendingWarning) {
    children.push(pendingWarning);
  }

  children.push(
    h(
      Text,
      { style: styles.versions, key: "versions" },
      `Versi: form PAPI ${papi.papiFormVersionId} · engine ${papi.engineVersion}\n` +
        `Dihitung ${papi.calculatedAt} · Difinalisasi ${papi.finalizedAt ?? "—"}`,
    ),
    h(Text, { style: styles.footer, fixed: true, key: "footer" }, FOOTER_TEXT),
  );

  return h(Page, { size: "A4", style: styles.page, key: "papi" }, ...children);
}

/** Halaman PAPI ketika tahapnya tidak dikerjakan — transparan, bukan dihilangkan. */
export function buildPapiSkippedPage(stage: PapiStageDto, candidateName: string): ReactElement {
  const reason =
    stage.skipReason === "participant_declined"
      ? "Peserta tidak melanjutkan ke kuesioner kepribadian."
      : stage.skipReason === "hr_closed_early"
        ? "Sesi ditutup lebih awal oleh HR."
        : "Bagian PAPI tidak dikerjakan pada sesi ini.";

  return h(
    Page,
    { size: "A4", style: styles.page, key: "papi-skipped" },
    h(Text, { style: styles.title }, "PAPI Kostick — tidak dikerjakan"),
    h(Text, { style: styles.subtitle }, `Peserta: ${candidateName}`),
    h(
      Text,
      { style: styles.note },
      `${reason} Skoring parsial sengaja tidak dilakukan: skor PAPI bersifat ipsatif dan hanya ` +
        "sah bila seluruh 90 nomor terisi. Laporan ini memuat hasil IST saja.",
    ),
    stage.skippedAt
      ? identityLine("Ditutup pada", new Date(stage.skippedAt).toISOString())
      : h(View, { key: "no-date" }),
    h(Text, { style: styles.footer, fixed: true }, FOOTER_TEXT),
  );
}
