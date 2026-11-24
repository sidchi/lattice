import { MAX_SCORE, MIN_SCORE } from "@/lib/feedback/rubric";

import type { SessionScorePoint } from "./progress";

/**
 * Geometry for the "scores over time" line chart, kept apart from the JSX so the maths is
 * unit-tested and the component stays a thin, server-rendered SVG (no chart library, no
 * client JavaScript).
 *
 * - The y axis is always the full 1-5 rubric scale. Auto-scaling to the data would turn a
 *   move from 3.0 to 3.2 into a cliff.
 * - The x axis is session order, not calendar time. Progress is per attempt; a two-week gap
 *   between sessions isn't information the reader needs, and even spacing keeps every point
 *   hoverable.
 */

/** Charts show at most this many recent sessions; older ones are in the session list. */
export const CHART_MAX_POINTS = 30;

export type ChartBox = { width: number; height: number };

export type ChartGeometry = ChartBox & {
  plot: { left: number; right: number; top: number; bottom: number };
  yTicks: { value: number; y: number }[];
  points: { x: number; y: number; point: SessionScorePoint }[];
  /** SVG path data for the line; empty for fewer than two points. */
  path: string;
};

const PADDING = { left: 28, right: 16, top: 12, bottom: 12 };

const round = (value: number) => Math.round(value * 100) / 100;

export function scoreTrendGeometry(
  data: readonly SessionScorePoint[],
  box: ChartBox = { width: 640, height: 200 },
): ChartGeometry {
  const plot = {
    left: PADDING.left,
    right: box.width - PADDING.right,
    top: PADDING.top,
    bottom: box.height - PADDING.bottom,
  };
  const yFor = (score: number) => {
    const clamped = Math.min(MAX_SCORE, Math.max(MIN_SCORE, score));
    const ratio = (clamped - MIN_SCORE) / (MAX_SCORE - MIN_SCORE);
    return round(plot.bottom - ratio * (plot.bottom - plot.top));
  };
  const xFor = (index: number) =>
    data.length === 1
      ? round((plot.left + plot.right) / 2)
      : round(plot.left + (index / (data.length - 1)) * (plot.right - plot.left));

  const yTicks = Array.from({ length: MAX_SCORE - MIN_SCORE + 1 }, (_, i) => {
    const value = MIN_SCORE + i;
    return { value, y: yFor(value) };
  });
  const points = data.map((point, index) => ({
    x: xFor(index),
    y: yFor(point.averageScore),
    point,
  }));
  const path =
    points.length < 2
      ? ""
      : points.map(({ x, y }, index) => `${index === 0 ? "M" : "L"}${x} ${y}`).join(" ");

  return { ...box, plot, yTicks, points, path };
}
