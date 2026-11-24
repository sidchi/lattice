import { describe, expect, it } from "vitest";

import { scoreTrendGeometry } from "./chart";
import type { SessionScorePoint } from "./progress";

const point = (averageScore: number, i = 0): SessionScorePoint => ({
  sessionId: `s${i}`,
  submittedAt: new Date(Date.UTC(2026, 10, i + 1)),
  averageScore,
  scoredAnswers: 1,
});

const box = { width: 144, height: 124 }; // plot: x 28..128, y 12..112

describe("scoreTrendGeometry", () => {
  it("maps the full 1-5 scale onto the plot, top to bottom", () => {
    const { plot, yTicks } = scoreTrendGeometry([], box);
    expect(plot).toEqual({ left: 28, right: 128, top: 12, bottom: 112 });
    expect(yTicks).toEqual([
      { value: 1, y: 112 },
      { value: 2, y: 87 },
      { value: 3, y: 62 },
      { value: 4, y: 37 },
      { value: 5, y: 12 },
    ]);
  });

  it("spaces sessions evenly from edge to edge and draws a line through them", () => {
    const { points, path } = scoreTrendGeometry([point(1, 0), point(3, 1), point(5, 2)], box);
    expect(points.map(({ x, y }) => [x, y])).toEqual([
      [28, 112],
      [78, 62],
      [128, 12],
    ]);
    expect(path).toBe("M28 112 L78 62 L128 12");
    expect(points[1]?.point.sessionId).toBe("s1");
  });

  it("centers a single session and draws no line", () => {
    const { points, path } = scoreTrendGeometry([point(2.5)], box);
    expect(points).toEqual([{ x: 78, y: 74.5, point: point(2.5) }]);
    expect(path).toBe("");
  });

  it("clamps out-of-scale scores to the plot", () => {
    const { points } = scoreTrendGeometry([point(0, 0), point(9, 1)], box);
    expect(points.map(({ y }) => y)).toEqual([112, 12]);
  });

  it("is empty without data", () => {
    expect(scoreTrendGeometry([], box)).toMatchObject({ points: [], path: "" });
  });
});
