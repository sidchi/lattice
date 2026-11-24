// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { seedQuestionBank } from "@/lib/seed/seed";
import { createTestDatabase, type TestDatabase } from "@/test/db";
import { evaluationFor } from "@/test/feedback";

import {
  type AnswerEvaluator,
  type Evaluation,
  EvaluationError,
  type EvaluationInput,
} from "./evaluator";
import { HeuristicEvaluator } from "./heuristic";
import { RUBRICS } from "./rubric";
import { EMPTY_ANSWER_EVALUATOR_ID, generateSessionFeedback, getSessionFeedback } from "./service";

let db: TestDatabase;
let userId: string;
let otherUserId: string;

beforeAll(async () => {
  db = createTestDatabase();
  await seedQuestionBank(db.prisma);
  userId = (await db.prisma.user.create({ data: { email: "ada@example.com" } })).id;
  otherUserId = (await db.prisma.user.create({ data: { email: "eve@example.com" } })).id;
});

afterAll(async () => {
  await db.dispose();
});

beforeEach(() => {
  // Failure paths log the underlying error; keep test output clean.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

type AnswerSpec = { question: string; content: string };

const DEFAULT_ANSWERS: AnswerSpec[] = [
  { question: "design-rate-limiter", content: "Token bucket in Redis, sharded by key." },
  { question: "tell-me-about-yourself", content: "I build payment systems." },
  { question: "two-sum", content: "Hash map of value to index, one pass, O(n)." },
];

/** A session for `userId`, submitted unless `inProgress`, with answers in the given order. */
async function createSession({
  answers = DEFAULT_ANSWERS,
  inProgress = false,
}: { answers?: AnswerSpec[]; inProgress?: boolean } = {}) {
  const questions = await db.prisma.question.findMany({
    where: { slug: { in: answers.map((answer) => answer.question) } },
    select: { id: true, slug: true },
  });
  const idFor = (slug: string) => questions.find((question) => question.slug === slug)!.id;
  const now = new Date();
  const session = await db.prisma.practiceSession.create({
    data: {
      userId,
      timeLimitSec: 3_600,
      startedAt: now,
      status: inProgress ? "IN_PROGRESS" : "SUBMITTED",
      submittedAt: inProgress ? null : now,
      answers: {
        create: answers.map((answer, position) => ({
          questionId: idFor(answer.question),
          position,
          content: answer.content,
          timeSpentSec: 300,
        })),
      },
    },
    include: { answers: { orderBy: { position: "asc" } } },
  });
  return { id: session.id, answerIds: session.answers.map((answer) => answer.id) };
}

/** An evaluator that scores every dimension `score` and records its inputs. */
function fixedEvaluator(score = 4, id = "fake:model-1") {
  const inputs: EvaluationInput[] = [];
  const evaluator: AnswerEvaluator = {
    id,
    evaluate: vi.fn(async (input: EvaluationInput): Promise<Evaluation> => {
      inputs.push(input);
      return evaluationFor(input.question.category, score, `Scored ${score}.`);
    }),
  };
  return { evaluator, inputs };
}

describe("generateSessionFeedback", () => {
  it("evaluates every answer against its category's rubric and stores the result", async () => {
    const session = await createSession();
    const { evaluator, inputs } = fixedEvaluator(4);

    const result = await generateSessionFeedback(db.prisma, userId, session.id, evaluator);

    expect(result).toEqual({
      ok: true,
      value: session.answerIds.map((answerId) => ({ answerId, status: "created" })),
    });
    expect(inputs.map((input) => input.rubric.category).sort()).toEqual([
      "BEHAVIORAL",
      "CODING",
      "SYSTEM_DESIGN",
    ]);
    const design = inputs.find((input) => input.rubric.category === "SYSTEM_DESIGN")!;
    expect(design.question.title).toBe("Design a distributed rate limiter");
    expect(design.answer).toEqual({
      content: "Token bucket in Redis, sharded by key.",
      timeSpentSec: 300,
    });

    const stored = await db.prisma.feedback.findUniqueOrThrow({
      where: { answerId: session.answerIds[2]! },
      include: { scores: true },
    });
    expect(stored).toMatchObject({
      overallScore: 4,
      summary: "Scored 4.",
      evaluator: "fake:model-1",
      rubricVersion: RUBRICS.CODING.version,
    });
    expect(stored.scores.map((score) => score.dimension).sort()).toEqual(
      RUBRICS.CODING.dimensions.map((dimension) => dimension.key).sort(),
    );
  });

  it("computes the overall score from weighted dimensions, not from the evaluator", async () => {
    const session = await createSession({ answers: [DEFAULT_ANSWERS[2]!] });
    const evaluator: AnswerEvaluator = {
      id: "fake:model-1",
      evaluate: async ({ rubric }) => ({
        summary: "Correct but unexplained.",
        scores: rubric.dimensions.map((dimension) => ({
          dimension: dimension.key,
          score: dimension.key === "correctness" ? 1 : 4,
          comment: "c",
        })),
      }),
    };
    await generateSessionFeedback(db.prisma, userId, session.id, evaluator);
    const feedback = await getSessionFeedback(db.prisma, userId, session.id);
    // (1*2 + 4*5) / 7 = 3.14 → 3
    expect(feedback.get(session.answerIds[0]!)!.overallScore).toBe(3);
  });

  it("skips answers that already have feedback unless asked to regenerate", async () => {
    const session = await createSession();
    await generateSessionFeedback(db.prisma, userId, session.id, fixedEvaluator(2).evaluator);

    const second = fixedEvaluator(5);
    const again = await generateSessionFeedback(db.prisma, userId, session.id, second.evaluator);
    expect(again.ok && again.value.every((outcome) => outcome.status === "skipped")).toBe(true);
    expect(second.evaluator.evaluate).not.toHaveBeenCalled();

    const regenerated = await generateSessionFeedback(
      db.prisma,
      userId,
      session.id,
      second.evaluator,
      { regenerate: true },
    );
    expect(regenerated.ok && regenerated.value.every((o) => o.status === "created")).toBe(true);
    const feedback = await getSessionFeedback(db.prisma, userId, session.id);
    expect([...feedback.values()].map((view) => view.overallScore)).toEqual([5, 5, 5]);
    // Replaced, not duplicated: one feedback row and one score row per dimension.
    expect(await db.prisma.feedback.count({ where: { answerId: { in: session.answerIds } } })).toBe(
      3,
    );
    expect(
      await db.prisma.feedbackScore.count({
        where: { feedback: { answerId: session.answerIds[0]! } },
      }),
    ).toBe(RUBRICS.SYSTEM_DESIGN.dimensions.length);
  });

  it("keeps successful answers when another one fails, and retries only the failures", async () => {
    const session = await createSession();
    const flaky: AnswerEvaluator = {
      id: "fake:model-1",
      evaluate: vi.fn(async (input: EvaluationInput) => {
        if (input.rubric.category === "BEHAVIORAL") {
          throw new EvaluationError("HTTP 503", "provider_error");
        }
        return evaluationFor(input.question.category, 3);
      }),
    };

    const result = await generateSessionFeedback(db.prisma, userId, session.id, flaky);
    expect(result).toEqual({
      ok: true,
      value: [
        { answerId: session.answerIds[0], status: "created" },
        {
          answerId: session.answerIds[1],
          status: "failed",
          message: "Feedback could not be generated",
        },
        { answerId: session.answerIds[2], status: "created" },
      ],
    });
    expect(console.error).toHaveBeenCalledOnce();

    const { evaluator, inputs } = fixedEvaluator(4);
    await generateSessionFeedback(db.prisma, userId, session.id, evaluator);
    expect(inputs.map((input) => input.rubric.category)).toEqual(["BEHAVIORAL"]);
    expect((await getSessionFeedback(db.prisma, userId, session.id)).size).toBe(3);
  });

  it("keeps the previous feedback when regenerating fails", async () => {
    const session = await createSession({ answers: [DEFAULT_ANSWERS[0]!] });
    await generateSessionFeedback(db.prisma, userId, session.id, fixedEvaluator(4).evaluator);

    const failing: AnswerEvaluator = {
      id: "fake:model-1",
      evaluate: async () => {
        throw new EvaluationError("Reply is not valid JSON", "invalid_output");
      },
    };
    const result = await generateSessionFeedback(db.prisma, userId, session.id, failing, {
      regenerate: true,
    });
    expect(result.ok && result.value[0]!.status).toBe("failed");
    const kept = await getSessionFeedback(db.prisma, userId, session.id);
    expect(kept.get(session.answerIds[0]!)!.overallScore).toBe(4);
  });

  it("scores an empty answer without calling the evaluator", async () => {
    const session = await createSession({
      answers: [{ question: "design-rate-limiter", content: "   \n " }],
    });
    const { evaluator } = fixedEvaluator();

    await generateSessionFeedback(db.prisma, userId, session.id, evaluator);

    expect(evaluator.evaluate).not.toHaveBeenCalled();
    const view = (await getSessionFeedback(db.prisma, userId, session.id)).get(
      session.answerIds[0]!,
    )!;
    expect(view).toMatchObject({ overallScore: 1, evaluator: EMPTY_ANSWER_EVALUATOR_ID });
    expect(view.scores.every((score) => score.score === 1)).toBe(true);
  });

  it("treats a concurrent duplicate request as skipped, never as a second row", async () => {
    const session = await createSession({ answers: [DEFAULT_ANSWERS[0]!] });
    // Both requests get past the "already has feedback?" check before either stores, so the
    // unique constraint on Feedback.answerId is what decides the race.
    let arrived = 0;
    let release!: () => void;
    const bothEvaluating = new Promise<void>((resolve) => (release = resolve));
    const racing = (score: number): AnswerEvaluator => ({
      id: "fake:model-1",
      evaluate: async (input) => {
        if (++arrived === 2) release();
        await bothEvaluating;
        return evaluationFor(input.question.category, score);
      },
    });

    const [a, b] = await Promise.all([
      generateSessionFeedback(db.prisma, userId, session.id, racing(3)),
      generateSessionFeedback(db.prisma, userId, session.id, racing(5)),
    ]);

    expect(arrived).toBe(2);
    const statuses = [a, b].map((result) => result.ok && result.value[0]!.status).sort();
    expect(statuses).toEqual(["created", "skipped"]);
    expect(await db.prisma.feedback.count({ where: { answerId: session.answerIds[0]! } })).toBe(1);
    expect(console.error).not.toHaveBeenCalled();
  });

  it("refuses sessions that are still in progress", async () => {
    const session = await createSession({ inProgress: true });
    const { evaluator } = fixedEvaluator();
    await expect(
      generateSessionFeedback(db.prisma, userId, session.id, evaluator),
    ).resolves.toEqual({ ok: false, error: "not_submitted" });
    expect(evaluator.evaluate).not.toHaveBeenCalled();
  });

  it("finalizes an expired session first, then evaluates it", async () => {
    const session = await createSession({ inProgress: true, answers: [DEFAULT_ANSWERS[0]!] });
    const later = new Date(Date.now() + 2 * 3_600_000);
    const result = await generateSessionFeedback(
      db.prisma,
      userId,
      session.id,
      fixedEvaluator().evaluator,
      { now: later },
    );
    expect(result.ok).toBe(true);
    const row = await db.prisma.practiceSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(row.status).toBe("SUBMITTED");
  });

  it("treats another user's session as not found", async () => {
    const session = await createSession();
    const { evaluator } = fixedEvaluator();
    await expect(
      generateSessionFeedback(db.prisma, otherUserId, session.id, evaluator),
    ).resolves.toEqual({ ok: false, error: "not_found" });
    await expect(
      generateSessionFeedback(db.prisma, userId, "missing-session", evaluator),
    ).resolves.toEqual({ ok: false, error: "not_found" });
    expect(evaluator.evaluate).not.toHaveBeenCalled();
  });

  it("works end to end with the offline heuristic", async () => {
    const session = await createSession();
    await generateSessionFeedback(db.prisma, userId, session.id, new HeuristicEvaluator());
    const feedback = await getSessionFeedback(db.prisma, userId, session.id);
    expect(feedback.size).toBe(3);
    for (const view of feedback.values()) expect(view.evaluator).toBe("heuristic-v1");
  });
});

describe("getSessionFeedback", () => {
  it("returns scores in rubric order with labels", async () => {
    const session = await createSession({ answers: [DEFAULT_ANSWERS[2]!] });
    await generateSessionFeedback(db.prisma, userId, session.id, fixedEvaluator(4).evaluator);

    const view = (await getSessionFeedback(db.prisma, userId, session.id)).get(
      session.answerIds[0]!,
    )!;
    expect(view.scores.map((score) => score.dimension)).toEqual(
      RUBRICS.CODING.dimensions.map((dimension) => dimension.key),
    );
    expect(view.scores[3]).toEqual({
      dimension: "edge_cases",
      label: "Edge cases & testing",
      score: 4,
      comment: "Comment on edge_cases.",
    });
  });

  it("sorts dimensions retired from the rubric last", async () => {
    const session = await createSession({ answers: [DEFAULT_ANSWERS[2]!] });
    await generateSessionFeedback(db.prisma, userId, session.id, fixedEvaluator(4).evaluator);
    const feedback = await db.prisma.feedback.findUniqueOrThrow({
      where: { answerId: session.answerIds[0]! },
    });
    await db.prisma.feedbackScore.create({
      data: { feedbackId: feedback.id, dimension: "legacy_style", score: 2 },
    });

    const view = (await getSessionFeedback(db.prisma, userId, session.id)).get(
      session.answerIds[0]!,
    )!;
    expect(view.scores.at(-1)).toEqual({
      dimension: "legacy_style",
      label: "legacy_style",
      score: 2,
      comment: null,
    });
  });

  it("is scoped to the session's owner", async () => {
    const session = await createSession();
    await generateSessionFeedback(db.prisma, userId, session.id, fixedEvaluator().evaluator);
    expect((await getSessionFeedback(db.prisma, otherUserId, session.id)).size).toBe(0);
  });
});
