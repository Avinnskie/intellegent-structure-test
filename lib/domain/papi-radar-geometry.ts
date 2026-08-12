import { PAPI_MAX_FACTOR_SCORE } from "../papi-factors.ts";

export type RadarPoint = { readonly x: number; readonly y: number };

export type RadarLayout = {
  readonly size: number;
  readonly center: RadarPoint;
  readonly radius: number;
  readonly rings: readonly { readonly score: number; readonly points: string }[];
  readonly spokes: readonly { readonly from: RadarPoint; readonly to: RadarPoint }[];
  readonly valuePoints: string;
  readonly valueDots: readonly RadarPoint[];
  readonly labels: readonly {
    readonly x: number;
    readonly y: number;
    readonly anchor: "start" | "middle" | "end";
  }[];
};

function polar(center: RadarPoint, index: number, count: number, radius: number): RadarPoint {
  const angle = (Math.PI * 2 * index) / count - Math.PI / 2;
  return {
    x: center.x + Math.cos(angle) * radius,
    y: center.y + Math.sin(angle) * radius,
  };
}

function toPoints(points: readonly RadarPoint[]): string {
  return points.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
}

function anchorFor(x: number, centerX: number, tolerance = 1): "start" | "middle" | "end" {
  if (x > centerX + tolerance) return "start";
  if (x < centerX - tolerance) return "end";
  return "middle";
}

export function buildPapiRadarLayout(
  scores: readonly number[],
  options: { size?: number; padding?: number; rings?: readonly number[] } = {},
): RadarLayout {
  const size = options.size ?? 220;
  const padding = options.padding ?? 26;
  const ringScores = options.rings ?? [3, 6, 9];

  const center: RadarPoint = { x: size / 2, y: size / 2 };
  const radius = Math.max(0, size / 2 - padding);
  const count = scores.length;

  if (count === 0) {
    return {
      size,
      center,
      radius,
      rings: [],
      spokes: [],
      valuePoints: "",
      valueDots: [],
      labels: [],
    };
  }

  const scaled = (score: number) =>
    (Math.min(Math.max(score, 0), PAPI_MAX_FACTOR_SCORE) / PAPI_MAX_FACTOR_SCORE) * radius;

  const rings = ringScores.map((score) => ({
    score,
    points: toPoints(
      Array.from({ length: count }, (_, index) => polar(center, index, count, scaled(score))),
    ),
  }));

  const spokes = Array.from({ length: count }, (_, index) => ({
    from: center,
    to: polar(center, index, count, radius),
  }));

  const valueDots = scores.map((score, index) => polar(center, index, count, scaled(score)));

  const labels = Array.from({ length: count }, (_, index) => {
    const point = polar(center, index, count, radius + 11);
    return { x: point.x, y: point.y, anchor: anchorFor(point.x, center.x) };
  });

  return {
    size,
    center,
    radius,
    rings,
    spokes,
    valuePoints: toPoints(valueDots),
    valueDots,
    labels,
  };
}
