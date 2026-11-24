import type { QuestionCategory } from "@/generated/prisma/enums";
import { findDimension } from "@/lib/feedback/rubric";

/**
 * Pure progress math: no database, no framework. The history service feeds it rows; tests
 * feed it literals. Everything here is deterministic so charts and summaries are
 * reproducible from stored scores.
 */

/** One answer's stored overall score, with the context progress is grouped by. */
export type ScoredAnswer = {
  sessionId: string;
  submittedAt: Date;
  category: QuestionCategory;
  overallScore: number;
};

/** One submitted session on the "scores over time" chart. */
export type SessionScorePoint = {
  sessionId: string;
  submittedAt: Date;
  /** Mean of the session's scored answers' overall scores (1-5, unrounded). */
  averageScore: number;
  scoredAnswers: number;
};

/** Comparison of the most recent sessions with the ones just before them. */
export type RecentTrend = {
  /** Sessions in each window. */
  window: number;
  recentAverage: number;
  previousAverage: number;
  /** `recentAverage - previousAverage`; positive is improvement. */
  delta: number;
};

export type DimensionAggregate = { dimension: string; averageScore: number; samples: number };

export type WeakArea = DimensionAggregate & {
  label: string;
  criteria: string | null;
  /** Categories whose rubric uses this dimension; empty for retired dimensions. */
  categories: QuestionCategory[];
};

export type CategoryProgress = {
  category: QuestionCategory;
  averageScore: number;
  scoredAnswers: number;
};

/** Weak areas need this many scored samples, so one bad answer isn't called a pattern. */
export const WEAK_AREA_MIN_SAMPLES = 2;
/** How many weak areas to surface. More than three stops being a focus list. */
export const WEAK_AREA_LIMIT = 3;
/** Upper bound on each window of the recent-trend comparison. */
export const TREND_WINDOW = 5;
/** Scores at or above this are not called weak, however they rank. */
export const WEAK_AREA_MAX_SCORE = 4;

export function mean(values: readonly number[]): number {
  if (values.length === 0) throw new Error("mean of an empty list");
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Groups answer scores into one point per session, oldest first (ties broken by id). */
export function sessionScorePoints(answers: readonly ScoredAnswer[]): SessionScorePoint[] {
  const bySession = new Map<string, { submittedAt: Date; scores: number[] }>();
  for (const answer of answers) {
    const entry = bySession.get(answer.sessionId);
    if (entry) entry.scores.push(answer.overallScore);
    else
      bySession.set(answer.sessionId, {
        submittedAt: answer.submittedAt,
        scores: [answer.overallScore],
      });
  }
  return [...bySession.entries()]
    .map(([sessionId, { submittedAt, scores }]) => ({
      sessionId,
      submittedAt,
      averageScore: mean(scores),
      scoredAnswers: scores.length,
    }))
    .sort(
      (a, b) =>
        a.submittedAt.getTime() - b.submittedAt.getTime() || a.sessionId.localeCompare(b.sessionId),
    );
}

/**
 * Last `window` sessions against the `window` before them. The window shrinks to half the
 * history for newer users (two sessions compare one against one), and there is no trend
 * with fewer than two sessions.
 */
export function recentTrend(
  points: readonly SessionScorePoint[],
  maxWindow: number = TREND_WINDOW,
): RecentTrend | null {
  const window = Math.min(maxWindow, Math.floor(points.length / 2));
  if (window < 1) return null;
  const scores = points.map((point) => point.averageScore);
  const recentAverage = mean(scores.slice(-window));
  const previousAverage = mean(scores.slice(-2 * window, -window));
  return { window, recentAverage, previousAverage, delta: recentAverage - previousAverage };
}

/** Average overall score per category, in a fixed category order. */
export function categoryProgress(answers: readonly ScoredAnswer[]): CategoryProgress[] {
  const order: QuestionCategory[] = ["SYSTEM_DESIGN", "BEHAVIORAL", "CODING"];
  return order.flatMap((category) => {
    const scores = answers
      .filter((answer) => answer.category === category)
      .map((answer) => answer.overallScore);
    return scores.length === 0
      ? []
      : [{ category, averageScore: mean(scores), scoredAnswers: scores.length }];
  });
}

/**
 * The dimensions to work on: lowest average first, only with enough samples, and only when
 * they are actually below "strong". Ties go to the dimension with more evidence, then by key
 * so the order is stable.
 */
export function rankWeakAreas(
  aggregates: readonly DimensionAggregate[],
  {
    minSamples = WEAK_AREA_MIN_SAMPLES,
    limit = WEAK_AREA_LIMIT,
    maxScore = WEAK_AREA_MAX_SCORE,
  }: { minSamples?: number; limit?: number; maxScore?: number } = {},
): WeakArea[] {
  return aggregates
    .filter((row) => row.samples >= minSamples && row.averageScore < maxScore)
    .sort(
      (a, b) =>
        a.averageScore - b.averageScore ||
        b.samples - a.samples ||
        a.dimension.localeCompare(b.dimension),
    )
    .slice(0, limit)
    .map((row) => {
      const found = findDimension(row.dimension);
      return {
        ...row,
        label: found?.dimension.label ?? row.dimension,
        criteria: found?.dimension.criteria ?? null,
        categories: found?.categories ?? [],
      };
    });
}

/** "3.4" — one decimal, which is all the precision a 1-5 rubric average deserves. */
export function formatScore(score: number): string {
  return (Math.round(score * 10) / 10).toFixed(1);
}

/** "+0.4", "−0.3", "±0.0" for a trend delta (true minus sign for screen readers and type). */
export function formatDelta(delta: number): string {
  const rounded = Math.round(delta * 10) / 10;
  if (rounded === 0) return "±0.0";
  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded).toFixed(1)}`;
}
