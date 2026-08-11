"use client";

import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { ResultDto } from "@/lib/server/calculate.ts";

const chartConfig = {
  standardScore: { label: "Skor standar", color: "var(--primary)" },
} satisfies ChartConfig;

export function ResultChart({ subtests }: { subtests: ResultDto["subtests"] }) {
  const data = subtests.map((subtest) => ({
    code: subtest.code,
    title: subtest.title,
    standardScore: subtest.standardScore,
    rawScore: subtest.rawScore,
    category: subtest.category,
  }));

  return (
    <ChartContainer config={chartConfig} className="mt-6 h-[320px] w-full">
      <BarChart accessibilityLayer data={data} margin={{ top: 24 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="code" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis tickLine={false} axisLine={false} width={36} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(_label, payload) => {
                const row = payload?.[0]?.payload as (typeof data)[number] | undefined;
                return row ? `${row.code} — ${row.title}` : "";
              }}
              formatter={(value, _name, item) => {
                const row = item?.payload as (typeof data)[number] | undefined;
                return `SW ${value} · RW ${row?.rawScore ?? "—"} · ${row?.category ?? ""}`;
              }}
            />
          }
        />
        <Bar dataKey="standardScore" fill="var(--color-standardScore)" radius={[6, 6, 0, 0]}>
          <LabelList position="top" offset={8} className="fill-muted-foreground" fontSize={11} />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
