/**
 * The PDF report document (T31, spec §17). Rendered from the SAME `ResultDto` the screen uses, so
 * screen and paper can never disagree.
 *
 * DETERMINISM IS A CONTRACT: the document body contains no `new Date()` reads of the wall clock
 * and no random ids — only the DTO's own recorded values (metadata dates are pinned to
 * `calculatedAt`). Two renders of one result must hash identically; the test pins it.
 *
 * Plain `.ts` with `createElement` — no JSX — because the Node test runner's type stripping does
 * not process `.tsx`, and this module must be importable by tests and by Next alike.
 */
import { createElement as h, type ReactElement } from "react";
import {
  Document,
  Page,
  renderToBuffer,
  StyleSheet,
  Text,
  View,
  type DocumentProps,
} from "@react-pdf/renderer";
import type { ResultDto } from "./calculate.ts";

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#1a1a1a" },
  title: { fontSize: 18, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  subtitle: { fontSize: 10, color: "#555555", marginBottom: 16 },
  sectionTitle: { fontSize: 12, fontFamily: "Helvetica-Bold", marginTop: 16, marginBottom: 6 },
  row: { flexDirection: "row" as const, borderBottom: "1 solid #dddddd", paddingVertical: 4 },
  headRow: { flexDirection: "row" as const, borderBottom: "1.5 solid #333333", paddingVertical: 4 },
  cellCode: { width: "15%", fontFamily: "Helvetica-Bold" },
  cellTitle: { width: "35%" },
  cellNum: { width: "12%", textAlign: "right" as const },
  cellCat: { width: "26%", paddingLeft: 8 },
  identityRow: { flexDirection: "row" as const, marginBottom: 3 },
  identityLabel: { width: 130, color: "#555555" },
  chartArea: {
    flexDirection: "row" as const,
    alignItems: "flex-end" as const,
    height: 120,
    marginTop: 10,
    gap: 6,
  },
  chartCol: { flex: 1, alignItems: "center" as const },
  chartBar: {
    width: "100%",
    backgroundColor: "#4657d9",
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },
  chartValue: { fontSize: 8, marginBottom: 2 },
  chartLabel: { fontSize: 8, marginTop: 3, color: "#555555" },
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
  versions: { marginTop: 14, fontSize: 8, color: "#777777" },
  totalRow: { flexDirection: "row" as const, paddingVertical: 4, marginTop: 2 },
  bold: { fontFamily: "Helvetica-Bold" },
});

function identityLine(label: string, value: string): ReactElement {
  return h(
    View,
    { style: styles.identityRow, key: label },
    h(Text, { style: styles.identityLabel }, label),
    h(Text, null, value),
  );
}

export function buildReportDocument(data: ResultDto): ReactElement<DocumentProps> {
  const maxSw = Math.max(...data.subtests.map((subtest) => subtest.standardScore), 1);

  const chartColumns = data.subtests.map((subtest) =>
    h(
      View,
      { style: styles.chartCol, key: subtest.code },
      h(Text, { style: styles.chartValue }, String(subtest.standardScore)),
      h(View, {
        style: [styles.chartBar, { height: Math.max((subtest.standardScore / maxSw) * 90, 6) }],
      }),
      h(Text, { style: styles.chartLabel }, subtest.code),
    ),
  );

  const tableRows = data.subtests.map((subtest) =>
    h(
      View,
      { style: styles.row, key: subtest.code },
      h(Text, { style: styles.cellCode }, subtest.code),
      h(Text, { style: styles.cellTitle }, subtest.title),
      h(Text, { style: styles.cellNum }, String(subtest.rawScore)),
      h(Text, { style: styles.cellNum }, String(subtest.standardScore)),
      h(Text, { style: styles.cellCat }, subtest.category),
    ),
  );

  return h(
    Document,
    {
      title: `Laporan IST — ${data.candidate.fullName}`,
      author: "IST Assessment Platform",
      // Metadata dates default to "now", which would break hash determinism.
      creationDate: new Date(data.calculatedAt),
      modificationDate: new Date(data.calculatedAt),
    },
    h(
      Page,
      { size: "A4", style: styles.page },
      h(Text, { style: styles.title }, "Laporan Hasil IST"),
      h(Text, { style: styles.subtitle }, "Intelligenz Struktur Test — ringkasan skor per subtes"),
      identityLine("Nama", data.candidate.fullName),
      identityLine("Tanggal lahir", data.candidate.birthDate),
      identityLine("Tanggal tes", data.testDate),
      identityLine("Usia saat tes", `${data.ageAtTest} tahun`),
      identityLine("Tujuan tes", data.candidate.testPurpose),
      identityLine("Norm band", data.normBandLabel ?? "—"),
      identityLine("IQ", `${data.iq.score ?? "—"} · ${data.iq.category ?? "—"}`),
      identityLine("Dominansi", data.dominance.dominance ?? "—"),
      h(Text, { style: styles.sectionTitle }, "Profil sembilan subtes (SW)"),
      h(View, { style: styles.chartArea }, ...chartColumns),
      h(Text, { style: styles.sectionTitle }, "Tabel skor"),
      h(
        View,
        { style: styles.headRow },
        h(Text, { style: styles.cellCode }, "Subtes"),
        h(Text, { style: styles.cellTitle }, "Nama"),
        h(Text, { style: styles.cellNum }, "RW"),
        h(Text, { style: styles.cellNum }, "SW"),
        h(Text, { style: styles.cellCat }, "Kategori"),
      ),
      ...tableRows,
      h(
        View,
        { style: styles.totalRow },
        h(Text, { style: styles.cellCode }, "Total"),
        h(Text, { style: styles.cellTitle }, ""),
        h(Text, { style: [styles.cellNum, styles.bold] }, String(data.totals.rawScore)),
        h(Text, { style: [styles.cellNum, styles.bold] }, String(data.totals.standardScore)),
        h(Text, { style: styles.cellCat }, ""),
      ),
      h(
        Text,
        { style: styles.versions },
        `Versi: form ${data.versions.formVersionId} · kunci ${data.versions.scoringKeyVersionId}` +
          ` · norma ${data.versions.normSetVersionId} · engine ${data.versions.engineVersion}\n` +
          `Dihitung ${data.calculatedAt} · Difinalisasi ${data.finalizedAt ?? "—"}`,
      ),
      h(
        Text,
        { style: styles.footer, fixed: true },
        "Laporan ini tidak memuat keputusan otomatis diterima/ditolak. Interpretasi akhir menjadi" +
          " wewenang psikolog/HR yang berwenang.",
      ),
    ),
  );
}

export async function renderReportPdf(data: ResultDto): Promise<Buffer> {
  return renderToBuffer(buildReportDocument(data));
}
