// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { EMPTY_ANSWER_EVALUATOR_ID } from "@/lib/feedback/service";
import { RUBRICS } from "@/lib/feedback/rubric";
import { seedQuestionBank } from "@/lib/seed/seed";
import { createTestDatabase, type TestDatabase } from "@/test/db";

import { getProgressSummary, listSessionHistory } from "./service";

let db: TestDatabase;
let userId: string;
let otherUserId: string;

const NOW = new Date("2026-11-20T12:00:00Z");
const day = (n: number) => new Date(Date.UTC(2026, 10, n, 9));

beforeAll(async () => {
  db = createTestDatabase();
  await seedQuestionBank(db.prisma);
});

afterAll(async () => {
  await db.dispose();
});

beforeEach(async () => {
  // Fresh users per test: sessions cascade with them, the question bank stays.
  await db.prisma.user.deleteMany();
  userId = (await db.prisma.user.create({ data: { email: "ada@example.com" } })).id;
  otherUserId = (await db.prisma.user.create({ data: { email: "eve@example.com" } })).id;
});

type AnswerSpec = {
  question: string;
  /** Every rubric dimension gets this score; overrides per dimension below. */
  score?: number;
  dimensions?: Record<string, number>;
  evaluator?: string;
  timeSpentSec?: number;
};

/**
 * A submitted session with feedback written directly, so these tests depend only on the
 * schema, not on the feedback service. `score: undefined` leaves an answer unscored.
 */
async function submittedSession(
  submittedAt: Date,
  answers: AnswerSpec[],
  { owner = userId }: { owner?: string } = {},
) {
  const questions = await db.prisma.question.findMany({
    where: { slug: { in: answers.map((answer) => answer.question) } },
    select: { id: true, slug: true, category: true },
  });
  const find = (slug: string) => questions.find((question) => question.slug === slug)!;

  return db.prisma.practiceSession.create({
    data: {
      userId: owner,
      status: "SUBMITTED",
      timeLimitSec: 3_600,
      startedAt: new Date(submittedAt.getTime() - 30 * 60_000),
      submittedAt,
      answers: {
        create: answers.map((spec, position) => {
          const question = find(spec.question);
          return {
            questionId: question.id,
            position,
            content: "Answer.",
            timeSpentSec: spec.timeSpentSec ?? 600,
            submittedAt,
            ...(spec.score !== undefined && {
              feedback: {
                create: {
                  overallScore: spec.score,
                  summary: "Summary.",
                  evaluator: spec.evaluator ?? "anthropic:model-a",
                  scores: {
                    create: RUBRICS[question.category].dimensions.map((dimension) => ({
                      dimension: dimension.key,
                      score: spec.dimensions?.[dimension.key] ?? spec.score!,
                    })),
                  },
                },
              },
            }),
          };
        }),
      },
    },
    select: { id: true },
  });
}

describe("getProgressSummary", () => {
  it("is empty for a user with no history", async () => {
    expect(await getProgressSummary(db.prisma, userId, { now: NOW })).toEqual({
      sessionsCompleted: 0,
      answersScored: 0,
      averageScore: null,
      timePracticedSec: 0,
      trend: [],
      recentTrend: null,
      weakAreas: [],
      categories: [],
      evaluators: [],
    });
  });

  it("summarizes sessions, the score trend and categories", async () => {
    const first = await submittedSession(day(1), [
      { question: "design-rate-limiter", score: 2, timeSpentSec: 900 },
      { question: "two-sum", score: 3, timeSpentSec: 300 },
    ]);
    const second = await submittedSession(day(5), [
      { question: "design-rate-limiter", score: 4, timeSpentSec: 1200 },
    ]);
    // Submitted but not scored yet: counts as practice, not on the chart.
    await submittedSession(day(6), [{ question: "two-sum", timeSpentSec: 60 }]);

    const summary = await getProgressSummary(db.prisma, userId, { now: NOW });

    expect(summary).toMatchObject({
      sessionsCompleted: 3,
      answersScored: 3,
      averageScore: 3,
      timePracticedSec: 2460,
      evaluators: ["anthropic:model-a"],
    });
    expect(summary.trend).toEqual([
      { sessionId: first.id, submittedAt: day(1), averageScore: 2.5, scoredAnswers: 2 },
      { sessionId: second.id, submittedAt: day(5), averageScore: 4, scoredAnswers: 1 },
    ]);
    expect(summary.recentTrend).toMatchObject({ window: 1, delta: 1.5 });
    expect(summary.categories).toEqual([
      { category: "SYSTEM_DESIGN", averageScore: 3, scoredAnswers: 2 },
      { category: "CODING", averageScore: 3, scoredAnswers: 1 },
    ]);
  });

  it("finds weak areas by grouping dimension scores, sharing keys across categories", async () => {
    await submittedSession(day(1), [
      { question: "design-rate-limiter", score: 4, dimensions: { tradeoffs: 1, communication: 2 } },
      { question: "two-sum", score: 4, dimensions: { edge_cases: 2, communication: 3 } },
    ]);
    await submittedSession(day(2), [
      { question: "design-rate-limiter", score: 4, dimensions: { tradeoffs: 2 } },
    ]);

    const { weakAreas } = await getProgressSummary(db.prisma, userId, { now: NOW });

    expect(
      weakAreas.map(({ dimension, averageScore, samples }) => [dimension, averageScore, samples]),
    ).toEqual([
      ["tradeoffs", 1.5, 2],
      // communication: 2, 3 and 4 across both categories.
      ["communication", 3, 3],
    ]);
    // edge_cases has a single sample, so it is not a pattern yet.
    expect(weakAreas[0]).toMatchObject({ label: "Trade-offs", categories: ["SYSTEM_DESIGN"] });
  });

  it("narrows scores to one evaluator, keeping empty-answer scores", async () => {
    await submittedSession(day(1), [
      { question: "design-rate-limiter", score: 2, evaluator: "heuristic-v1" },
    ]);
    await submittedSession(day(2), [
      { question: "design-rate-limiter", score: 4, evaluator: "anthropic:model-a" },
      { question: "two-sum", score: 1, evaluator: EMPTY_ANSWER_EVALUATOR_ID },
    ]);

    const all = await getProgressSummary(db.prisma, userId, { now: NOW });
    expect(all.answersScored).toBe(3);
    expect(all.evaluators).toEqual(["anthropic:model-a", "heuristic-v1"]);

    const llm = await getProgressSummary(db.prisma, userId, {
      now: NOW,
      evaluator: "anthropic:model-a",
    });
    expect(llm).toMatchObject({ answersScored: 2, averageScore: 2.5, sessionsCompleted: 2 });
    expect(llm.trend).toHaveLength(1);
    // The filter narrows scores, not the list of evaluators to choose from.
    expect(llm.evaluators).toEqual(["anthropic:model-a", "heuristic-v1"]);
  });

  it("finalizes expired sessions first and ignores live ones", async () => {
    const question = await db.prisma.question.findUniqueOrThrow({
      where: { slug: "two-sum" },
      select: { id: true },
    });
    const create = (startedAt: Date) =>
      db.prisma.practiceSession.create({
        data: {
          userId,
          timeLimitSec: 600,
          startedAt,
          answers: { create: [{ questionId: question.id, position: 0, timeSpentSec: 120 }] },
        },
        select: { id: true },
      });
    const abandoned = await create(day(1));
    const live = await create(new Date(NOW.getTime() - 60_000));

    const summary = await getProgressSummary(db.prisma, userId, { now: NOW });

    expect(summary).toMatchObject({ sessionsCompleted: 1, timePracticedSec: 120 });
    const rows = await db.prisma.practiceSession.findMany({
      where: { id: { in: [abandoned.id, live.id] } },
      select: { id: true, status: true, submittedAt: true },
    });
    expect(rows.find((row) => row.id === abandoned.id)).toMatchObject({
      status: "SUBMITTED",
      submittedAt: new Date(day(1).getTime() + 600_000),
    });
    expect(rows.find((row) => row.id === live.id)?.status).toBe("IN_PROGRESS");
  });

  it("never includes another user's sessions", async () => {
    await submittedSession(day(1), [{ question: "two-sum", score: 1 }], { owner: otherUserId });
    const summary = await getProgressSummary(db.prisma, userId, { now: NOW });
    expect(summary.sessionsCompleted).toBe(0);
    expect(summary.weakAreas).toEqual([]);
    expect(summary.evaluators).toEqual([]);
  });
});

describe("listSessionHistory", () => {
  it("lists submitted sessions newest first with per-session scores and time", async () => {
    const older = await submittedSession(day(1), [
      { question: "design-rate-limiter", score: 2, timeSpentSec: 900 },
      { question: "two-sum", timeSpentSec: 300 },
    ]);
    const newer = await submittedSession(day(3), [{ question: "two-sum", score: 5 }]);
    await submittedSession(day(4), [{ question: "two-sum", score: 5 }], { owner: otherUserId });

    const history = await listSessionHistory(db.prisma, userId, { now: NOW });

    expect(history).toMatchObject({ page: 1, pageCount: 1, total: 2 });
    expect(history.items.map((item) => item.id)).toEqual([newer.id, older.id]);
    expect(history.items[1]).toEqual({
      id: older.id,
      submittedAt: day(1),
      questions: [
        { title: "Design a distributed rate limiter", category: "SYSTEM_DESIGN" },
        { title: "Two sum", category: "CODING" },
      ],
      answerCount: 2,
      scoredAnswers: 1,
      averageScore: 2,
      timeSpentSec: 1200,
    });
  });

  it("pages, and clamps a page past the end to the last page", async () => {
    for (let n = 1; n <= 5; n++) {
      await submittedSession(day(n), [{ question: "two-sum", score: 3 }]);
    }

    const second = await listSessionHistory(db.prisma, userId, { page: 2, pageSize: 2, now: NOW });
    expect(second).toMatchObject({ page: 2, pageCount: 3, total: 5 });
    expect(second.items.map((item) => item.submittedAt)).toEqual([day(3), day(2)]);

    const clamped = await listSessionHistory(db.prisma, userId, {
      page: 99,
      pageSize: 2,
      now: NOW,
    });
    expect(clamped.page).toBe(3);
    expect(clamped.items).toHaveLength(1);
  });

  it("returns one empty page without history", async () => {
    expect(await listSessionHistory(db.prisma, userId, { now: NOW })).toEqual({
      items: [],
      page: 1,
      pageCount: 1,
      total: 0,
    });
  });
});
