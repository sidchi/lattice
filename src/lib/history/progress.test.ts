import { describe, expect, it } from "vitest";

import {
  categoryProgress,
  formatDelta,
  formatScore,
  mean,
  rankWeakAreas,
  recentTrend,
  type ScoredAnswer,
  type SessionScorePoint,
  sessionScorePoints,
} from "./progress";

const at = (day: number) => new Date(Date.UTC(2026, 10, day, 12));

const answer = (
  sessionId: string,
  day: number,
  overallScore: number,
  category: ScoredAnswer["category"] = "SYSTEM_DESIGN",
): ScoredAnswer => ({ sessionId, submittedAt: at(day), category, overallScore });

const points = (...scores: number[]): SessionScorePoint[] =>
  scores.map((averageScore, i) => ({
    sessionId: `s${i}`,
    submittedAt: at(i + 1),
    averageScore,
    scoredAnswers: 1,
  }));

describe("mean", () => {
  it("averages and refuses an empty list", () => {
    expect(mean([1, 2, 4])).toBeCloseTo(7 / 3);
    expect(() => mean([])).toThrow(/empty/);
  });
});

describe("sessionScorePoints", () => {
  it("averages each session's answers and orders sessions oldest first", () => {
    const result = sessionScorePoints([
      answer("b", 3, 4),
      answer("a", 1, 2),
      answer("b", 3, 5, "CODING"),
      answer("a", 1, 3, "BEHAVIORAL"),
    ]);
    expect(result).toEqual([
      { sessionId: "a", submittedAt: at(1), averageScore: 2.5, scoredAnswers: 2 },
      { sessionId: "b", submittedAt: at(3), averageScore: 4.5, scoredAnswers: 2 },
    ]);
  });

  it("breaks submission-time ties by id so the order is stable", () => {
    const result = sessionScorePoints([answer("z", 1, 3), answer("m", 1, 3)]);
    expect(result.map((point) => point.sessionId)).toEqual(["m", "z"]);
  });

  it("is empty without scored answers", () => {
    expect(sessionScorePoints([])).toEqual([]);
  });
});

describe("recentTrend", () => {
  it("needs at least two sessions", () => {
    expect(recentTrend([])).toBeNull();
    expect(recentTrend(points(3))).toBeNull();
  });

  it("compares one against one for a new user", () => {
    expect(recentTrend(points(2, 4))).toEqual({
      window: 1,
      recentAverage: 4,
      previousAverage: 2,
      delta: 2,
    });
  });

  it("shrinks the window to half the history, ignoring an odd oldest session", () => {
    const trend = recentTrend(points(1, 2, 3, 4, 5));
    expect(trend).toMatchObject({ window: 2, recentAverage: 4.5, previousAverage: 2.5 });
  });

  it("caps the window and ignores sessions older than both windows", () => {
    const trend = recentTrend(points(1, 1, 1, 3, 3, 3, 4, 4, 4), 3);
    expect(trend).toMatchObject({ window: 3, recentAverage: 4, previousAverage: 3, delta: 1 });
  });

  it("reports a decline as a negative delta", () => {
    expect(recentTrend(points(4, 3))?.delta).toBe(-1);
  });
});

describe("categoryProgress", () => {
  it("averages per category in a fixed order and omits unpracticed ones", () => {
    expect(
      categoryProgress([
        answer("a", 1, 2, "CODING"),
        answer("a", 1, 4, "SYSTEM_DESIGN"),
        answer("b", 2, 3, "CODING"),
      ]),
    ).toEqual([
      { category: "SYSTEM_DESIGN", averageScore: 4, scoredAnswers: 1 },
      { category: "CODING", averageScore: 2.5, scoredAnswers: 2 },
    ]);
  });
});

describe("rankWeakAreas", () => {
  it("ranks the lowest averages first and attaches rubric metadata", () => {
    const result = rankWeakAreas([
      { dimension: "architecture", averageScore: 3.5, samples: 4 },
      { dimension: "tradeoffs", averageScore: 2, samples: 4 },
      { dimension: "communication", averageScore: 2.8, samples: 9 },
    ]);
    expect(result.map((area) => area.dimension)).toEqual([
      "tradeoffs",
      "communication",
      "architecture",
    ]);
    expect(result[0]).toMatchObject({
      label: "Trade-offs",
      categories: ["SYSTEM_DESIGN"],
      criteria: expect.stringContaining("alternatives"),
    });
    expect(result[1]?.categories).toHaveLength(3);
  });

  it("needs enough samples before calling something a weak area", () => {
    const result = rankWeakAreas([
      { dimension: "tradeoffs", averageScore: 1, samples: 1 },
      { dimension: "impact", averageScore: 3, samples: 2 },
    ]);
    expect(result.map((area) => area.dimension)).toEqual(["impact"]);
  });

  it("does not call strong dimensions weak, however they rank", () => {
    expect(rankWeakAreas([{ dimension: "impact", averageScore: 4, samples: 5 }])).toEqual([]);
  });

  it("breaks ties by evidence, then by key, and respects the limit", () => {
    const result = rankWeakAreas(
      [
        { dimension: "impact", averageScore: 2, samples: 2 },
        { dimension: "actions", averageScore: 2, samples: 2 },
        { dimension: "situation", averageScore: 2, samples: 6 },
        { dimension: "reflection", averageScore: 3, samples: 6 },
      ],
      { limit: 3 },
    );
    expect(result.map((area) => area.dimension)).toEqual(["situation", "actions", "impact"]);
  });

  it("keeps retired dimensions, labelled by key", () => {
    expect(rankWeakAreas([{ dimension: "old_key", averageScore: 2, samples: 3 }])[0]).toMatchObject(
      { label: "old_key", criteria: null, categories: [] },
    );
  });
});

describe("formatting", () => {
  it("formats scores to one decimal", () => {
    expect(formatScore(3)).toBe("3.0");
    expect(formatScore(3.449)).toBe("3.4");
    expect(formatScore(3.45)).toBe("3.5");
  });

  it("signs deltas with a true minus and a neutral zero", () => {
    expect(formatDelta(0.42)).toBe("+0.4");
    expect(formatDelta(-0.26)).toBe("−0.3");
    expect(formatDelta(0.04)).toBe("±0.0");
    expect(formatDelta(-0.04)).toBe("±0.0");
  });
});
