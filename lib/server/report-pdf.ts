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
import type { PapiResultDto, PapiStageDto } from "./papi-result-read.ts";
import { buildPapiPage, buildPapiSkippedPage } from "./report-pdf-papi.ts";

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

export type PapiReportAttachment = {
  readonly stage: PapiStageDto;
  readonly result: PapiResultDto | null;
};

/**
 * Halaman PAPI hanya ikut bila sesi memang memuatnya. Bila tahap PAPI
 * dilewati, laporan tetap memuat satu halaman penjelas alih-alih diam —
 * pembaca laporan harus tahu bagian itu tidak dikerjakan, bukan hilang.
 */
function papiPages(papi: PapiReportAttachment | null, candidateName: string): ReactElement[] {
  if (!papi || !papi.stage.includesPapi) {
    return [];
  }
  if (papi.result) {
    return [buildPapiPage(papi.result)];
  }
  return [buildPapiSkippedPage(papi.stage, candidateName)];
}

export function buildReportDocument(
  data: ResultDto,
  papi: PapiReportAttachment | null = null,
): ReactElement<DocumentProps> {
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
      title: `${papi?.result ? "Laporan IST + PAPI" : "Laporan IST"} — ${data.candidate.fullName}`,
      author: "IST Assessment Platform",
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
    ),
    ...papiPages(papi, data.candidate.fullName),
  );
}

export async function renderReportPdf(
  data: ResultDto,
  papi: PapiReportAttachment | null = null,
): Promise<Buffer> {
  return renderToBuffer(buildReportDocument(data, papi));
}
