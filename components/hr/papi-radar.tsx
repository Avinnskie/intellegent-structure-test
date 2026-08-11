"use client";

import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { papiCategoryLabel } from "@/lib/domain/papi-format.ts";
import { PAPI_MAX_FACTOR_SCORE } from "@/lib/papi-factors.ts";
import type { PapiFactorRow } from "@/lib/server/papi-result-read.ts";

const chartConfig = {
  score: { label: "Skor", color: "var(--primary)" },
} satisfies ChartConfig;

type RadarDatum = {
  code: string;
  name: string;
  kind: "role" | "need";
  score: number;
  category: string;
};

type TickProps = {
  x?: number | string;
  y?: number | string;
  textAnchor?: string;
  index?: number;
};

function makeTick(data: readonly RadarDatum[]) {
  function FactorTick(props: TickProps) {
    const { textAnchor, index = 0 } = props;
    const x = Number(props.x ?? 0);
    const y = Number(props.y ?? 0);
    const datum = data[index];
    if (!datum) {
      return null;
    }

    const anchor = (textAnchor ?? "middle") as "start" | "middle" | "end";
    const dx = anchor === "start" ? 2 : anchor === "end" ? -2 : 0;

    return (
      <g transform={`translate(${x + dx}, ${y})`}>
        <text
          textAnchor={anchor}
          dy={-2}
          className={
            datum.kind === "role"
              ? "fill-foreground text-[11px] font-bold"
              : "fill-muted-foreground text-[11px] font-bold"
          }
        >
          {datum.code}
        </text>
        <text
          textAnchor={anchor}
          dy={11}
          className="fill-muted-foreground text-[10px] tabular-nums"
        >
          {datum.score}
        </text>
      </g>
    );
  }

  return FactorTick;
}

export function PapiRadar({ factors }: { readonly factors: readonly PapiFactorRow[] }) {
  const data: RadarDatum[] = factors.map((factor) => ({
    code: factor.code,
    name: factor.name,
    kind: factor.kind,
    score: factor.score,
    category: factor.category,
  }));

  return (
    <div className="w-full">
      <ChartContainer
        config={chartConfig}
        className="mx-auto aspect-square w-full max-w-[420px] [&_.recharts-polar-grid-angle_line]:stroke-border/60"
      >
        <RadarChart
          data={data}
          outerRadius="68%"
          margin={{ top: 24, right: 32, bottom: 24, left: 32 }}
        >
          <PolarGrid gridType="polygon" className="stroke-border" />

          <PolarAngleAxis dataKey="code" tick={makeTick(data)} />

          <PolarRadiusAxis
            domain={[0, PAPI_MAX_FACTOR_SCORE]}
            tickCount={4}
            angle={90}
            axisLine={false}
            tick={{ fontSize: 9 }}
            className="fill-muted-foreground/70"
          />

          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(_label, payload) => {
                  const row = payload?.[0]?.payload as RadarDatum | undefined;
                  return row ? `${row.code} — ${row.name}` : "";
                }}
                formatter={(value, _name, item) => {
                  const row = item?.payload as RadarDatum | undefined;
                  return `${value} dari ${PAPI_MAX_FACTOR_SCORE} · ${papiCategoryLabel(
                    row?.category ?? "",
                  )} · ${row?.kind === "role" ? "Role" : "Need"}`;
                }}
              />
            }
          />

          <Radar
            dataKey="score"
            fill="var(--color-score)"
            fillOpacity={0.2}
            stroke="var(--color-score)"
            strokeWidth={2}
            strokeLinejoin="round"
            dot={{ r: 2, fillOpacity: 1, fill: "var(--color-score)", strokeWidth: 0 }}
            isAnimationActive={false}
          />
        </RadarChart>
      </ChartContainer>
    </div>
  );
}
