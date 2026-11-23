import type { PrismaClient } from "@/generated/prisma/client";
import { PracticeSessionStatus } from "@/generated/prisma/enums";
import { getSession, type PracticeAnswerView } from "@/lib/practice/service";

import type { AnswerEvaluator, Evaluation } from "./evaluator";
import { dimensionLabel, MIN_SCORE, overallScore, rubricFor } from "./rubric";

/**
 * Answer feedback: run an evaluator over a submitted session's answers and store the result.
 *
 * - **Only submitted sessions.** Feedback on a live session would leak a grade mid-interview.
 *   Loading goes through the practice service, so ownership checks and lazy expiry apply.
 * - **Idempotent by default.** Answers that already have feedback are skipped, so a double
 *   click or a retried request does not pay for a second model call. `regenerate` replaces
 *   existing feedback explicitly.
 * - **Partial success.** Each answer is evaluated independently; one provider failure does
 *   not throw away the others, and the user can retry just the failed ones.
 * - **Concurrency-safe.** `Feedback.answerId` is unique. If two requests race to create the
 *   same feedback, the loser's insert hits the constraint and is reported as `skipped`.
 * - **Empty answers cost nothing.** They get a fixed minimum score without calling the model.
 */

export const EMPTY_ANSWER_EVALUATOR_ID = "empty-answer";

/** Per-answer time budget for one evaluation, including the evaluator's own retries. */
export const EVALUATION_TIMEOUT_MS = 90_000;

export type FeedbackError = "not_found" | "not_submitted";

export type AnswerFeedbackOutcome =
  | { answerId: string; status: "created" }
  | { answerId: string; status: "skipped" }
  | { answerId: string; status: "failed"; message: string };

export type FeedbackResult =
  { ok: true; value: AnswerFeedbackOutcome[] } | { ok: false; error: FeedbackError };

export type FeedbackView = {
  overallScore: number;
  summary: string;
  evaluator: string;
  rubricVersion: number;
  createdAt: Date;
  scores: { dimension: string; label: string; score: number; comment: string | null }[];
};

function emptyAnswerEvaluation(answer: PracticeAnswerView): Evaluation {
  return {
    summary:
      "No answer was written, so there is nothing to evaluate. Even a partial outline earns credit in a real interview.",
    scores: rubricFor(answer.question.category).dimensions.map((dimension) => ({
      dimension: dimension.key,
      score: MIN_SCORE,
      comment: "Not addressed.",
    })),
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002"
  );
}

async function store(
  prisma: PrismaClient,
  answer: PracticeAnswerView,
  evaluation: Evaluation,
  evaluator: string,
  replace: boolean,
): Promise<"created" | "skipped"> {
  const rubric = rubricFor(answer.question.category);
  const scores = Object.fromEntries(
    evaluation.scores.map((entry) => [entry.dimension, entry.score]),
  );
  const data = {
    answerId: answer.id,
    overallScore: overallScore(rubric, scores),
    summary: evaluation.summary,
    evaluator,
    rubricVersion: rubric.version,
    scores: {
      create: evaluation.scores.map(({ dimension, score, comment }) => ({
        dimension,
        score,
        comment,
      })),
    },
  };
  try {
    await prisma.$transaction(async (tx) => {
      if (replace) await tx.feedback.deleteMany({ where: { answerId: answer.id } });
      await tx.feedback.create({ data });
    });
    return "created";
  } catch (error) {
    if (isUniqueViolation(error)) return "skipped";
    throw error;
  }
}

async function evaluateAnswer(
  prisma: PrismaClient,
  answer: PracticeAnswerView,
  evaluator: AnswerEvaluator,
  replace: boolean,
): Promise<AnswerFeedbackOutcome> {
  try {
    if (!answer.content.trim()) {
      const status = await store(
        prisma,
        answer,
        emptyAnswerEvaluation(answer),
        EMPTY_ANSWER_EVALUATOR_ID,
        replace,
      );
      return { answerId: answer.id, status };
    }
    const evaluation = await evaluator.evaluate(
      {
        question: answer.question,
        answer: { content: answer.content, timeSpentSec: answer.timeSpentSec },
        rubric: rubricFor(answer.question.category),
      },
      { signal: AbortSignal.timeout(EVALUATION_TIMEOUT_MS) },
    );
    const status = await store(prisma, answer, evaluation, evaluator.id, replace);
    return { answerId: answer.id, status };
  } catch (error) {
    // Logged server-side with the detail; the user sees a generic failure per answer.
    console.error(`Feedback for answer ${answer.id} failed`, error);
    return { answerId: answer.id, status: "failed", message: "Feedback could not be generated" };
  }
}

/**
 * Generates feedback for every answer in a submitted session that does not have it yet, or
 * for every answer when `regenerate` is set. Answers are evaluated concurrently (a session
 * has at most three).
 */
export async function generateSessionFeedback(
  prisma: PrismaClient,
  userId: string,
  sessionId: string,
  evaluator: AnswerEvaluator,
  { regenerate = false, now }: { regenerate?: boolean; now?: Date } = {},
): Promise<FeedbackResult> {
  const session = await getSession(prisma, userId, sessionId, { now });
  if (!session.ok) return { ok: false, error: "not_found" };
  if (session.value.status !== PracticeSessionStatus.SUBMITTED) {
    return { ok: false, error: "not_submitted" };
  }

  const answers = session.value.answers;
  const existing = new Set(
    (
      await prisma.feedback.findMany({
        where: { answerId: { in: answers.map((answer) => answer.id) } },
        select: { answerId: true },
      })
    ).map((row) => row.answerId),
  );

  const outcomes = await Promise.all(
    answers.map((answer): Promise<AnswerFeedbackOutcome> =>
      !regenerate && existing.has(answer.id)
        ? Promise.resolve({ answerId: answer.id, status: "skipped" })
        : evaluateAnswer(prisma, answer, evaluator, regenerate),
    ),
  );
  return { ok: true, value: outcomes };
}

/**
 * Stored feedback for a session's answers, keyed by answer id, scores in rubric order.
 * Scoped by owner like every other session read.
 */
export async function getSessionFeedback(
  prisma: PrismaClient,
  userId: string,
  sessionId: string,
): Promise<Map<string, FeedbackView>> {
  const rows = await prisma.feedback.findMany({
    where: { answer: { sessionId, session: { userId } } },
    select: {
      answerId: true,
      overallScore: true,
      summary: true,
      evaluator: true,
      rubricVersion: true,
      createdAt: true,
      answer: { select: { question: { select: { category: true } } } },
      scores: { select: { dimension: true, score: true, comment: true } },
    },
  });

  return new Map(
    rows.map((row) => {
      const order = rubricFor(row.answer.question.category).dimensions.map((d) => d.key);
      const rank = (key: string) => (order.includes(key) ? order.indexOf(key) : order.length);
      const scores = [...row.scores]
        .sort(
          (a, b) => rank(a.dimension) - rank(b.dimension) || a.dimension.localeCompare(b.dimension),
        )
        .map((score) => ({ ...score, label: dimensionLabel(score.dimension) }));
      const { answerId, overallScore: overall, summary, evaluator, rubricVersion, createdAt } = row;
      return [
        answerId,
        { overallScore: overall, summary, evaluator, rubricVersion, createdAt, scores },
      ];
    }),
  );
}
