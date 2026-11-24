import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { PracticeSessionStatus, type QuestionCategory } from "@/generated/prisma/enums";
import { EMPTY_ANSWER_EVALUATOR_ID } from "@/lib/feedback/service";
import { finalizeExpiredSessions } from "@/lib/practice/service";

import {
  type CategoryProgress,
  categoryProgress,
  mean,
  rankWeakAreas,
  recentTrend,
  type RecentTrend,
  sessionScorePoints,
  type SessionScorePoint,
  type WeakArea,
} from "./progress";

/**
 * Read model for history and progress (roadmap item 7).
 *
 * - **Submitted sessions only.** In-progress sessions have no scores yet, and history should
 *   not change under a running interview. Lazy expiry is applied first
 *   (`finalizeExpiredSessions`), so a session abandoned in a closed tab still counts.
 * - **Owner-scoped.** Every query filters on `userId` through the session relation.
 * - **Comparable scores.** Scores from different evaluators (offline heuristic vs. an LLM, or
 *   two models) are not on the same scale. Progress can be narrowed to one evaluator.
 *   "Empty answer" scores belong to every evaluator: not answering is a 1 whoever grades.
 * - **Aggregation in the database where it is a plain GROUP BY.** Weak areas group
 *   `FeedbackScore` rows by dimension in SQL; per-session averages are computed in TypeScript
 *   from one row per scored answer, which stays small (three answers per session).
 */

export type ProgressOptions = {
  /** Only count feedback from this evaluator (plus empty-answer scores). */
  evaluator?: string;
  now?: Date;
};

export type ProgressSummary = {
  sessionsCompleted: number;
  answersScored: number;
  /** Mean overall score across scored answers, or null if nothing has been scored. */
  averageScore: number | null;
  /** Sum of time spent across submitted answers, in seconds. */
  timePracticedSec: number;
  trend: SessionScorePoint[];
  recentTrend: RecentTrend | null;
  weakAreas: WeakArea[];
  categories: CategoryProgress[];
  /** Evaluators that have scored this user's answers, for the "scored by" filter. */
  evaluators: string[];
};

export type SessionHistoryItem = {
  id: string;
  submittedAt: Date;
  questions: { title: string; category: QuestionCategory }[];
  answerCount: number;
  scoredAnswers: number;
  averageScore: number | null;
  timeSpentSec: number;
};

export type SessionHistoryPage = {
  items: SessionHistoryItem[];
  page: number;
  pageCount: number;
  total: number;
};

export const HISTORY_PAGE_SIZE = 10;

const submittedBy = (userId: string) =>
  ({ userId, status: PracticeSessionStatus.SUBMITTED }) satisfies Prisma.PracticeSessionWhereInput;

function feedbackWhere(userId: string, evaluator?: string): Prisma.FeedbackWhereInput {
  return {
    answer: { session: submittedBy(userId) },
    ...(evaluator && { evaluator: { in: [evaluator, EMPTY_ANSWER_EVALUATOR_ID] } }),
  };
}

/** Headline numbers, score trend, weak areas and per-category averages for one user. */
export async function getProgressSummary(
  prisma: PrismaClient,
  userId: string,
  { evaluator, now = new Date() }: ProgressOptions = {},
): Promise<ProgressSummary> {
  await finalizeExpiredSessions(prisma, userId, { now });

  const [sessionsCompleted, timeSpent, scored, dimensions, evaluatorRows] = await Promise.all([
    prisma.practiceSession.count({ where: submittedBy(userId) }),
    prisma.answer.aggregate({
      where: { session: submittedBy(userId) },
      _sum: { timeSpentSec: true },
    }),
    prisma.feedback.findMany({
      where: feedbackWhere(userId, evaluator),
      select: {
        overallScore: true,
        answer: {
          select: {
            sessionId: true,
            session: { select: { submittedAt: true } },
            question: { select: { category: true } },
          },
        },
      },
    }),
    prisma.feedbackScore.groupBy({
      by: ["dimension"],
      where: { feedback: feedbackWhere(userId, evaluator) },
      _avg: { score: true },
      _count: { _all: true },
    }),
    prisma.feedback.findMany({
      where: { ...feedbackWhere(userId), evaluator: { not: EMPTY_ANSWER_EVALUATOR_ID } },
      distinct: ["evaluator"],
      select: { evaluator: true },
      orderBy: { evaluator: "asc" },
    }),
  ]);

  const answers = scored.flatMap((row) =>
    // Submitted sessions always have submittedAt; the guard only satisfies the type.
    row.answer.session.submittedAt
      ? [
          {
            sessionId: row.answer.sessionId,
            submittedAt: row.answer.session.submittedAt,
            category: row.answer.question.category,
            overallScore: row.overallScore,
          },
        ]
      : [],
  );
  const trend = sessionScorePoints(answers);

  return {
    sessionsCompleted,
    answersScored: answers.length,
    averageScore: answers.length ? mean(answers.map((a) => a.overallScore)) : null,
    timePracticedSec: timeSpent._sum.timeSpentSec ?? 0,
    trend,
    recentTrend: recentTrend(trend),
    weakAreas: rankWeakAreas(
      dimensions.map((row) => ({
        dimension: row.dimension,
        averageScore: row._avg.score ?? 0,
        samples: row._count._all,
      })),
    ),
    categories: categoryProgress(answers),
    evaluators: evaluatorRows.map((row) => row.evaluator),
  };
}

/**
 * Submitted sessions, newest first, one page at a time. A page past the end is clamped to
 * the last page, like the question bank. Average scores here use every evaluator: the list
 * describes what happened, the progress summary is where scores get compared.
 */
export async function listSessionHistory(
  prisma: PrismaClient,
  userId: string,
  {
    page = 1,
    pageSize = HISTORY_PAGE_SIZE,
    now = new Date(),
  }: { page?: number; pageSize?: number; now?: Date } = {},
): Promise<SessionHistoryPage> {
  await finalizeExpiredSessions(prisma, userId, { now });

  const total = await prisma.practiceSession.count({ where: submittedBy(userId) });
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, Math.floor(page)), pageCount);

  const rows = await prisma.practiceSession.findMany({
    where: submittedBy(userId),
    orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
    skip: (current - 1) * pageSize,
    take: pageSize,
    select: {
      id: true,
      submittedAt: true,
      startedAt: true,
      answers: {
        orderBy: { position: "asc" },
        select: {
          timeSpentSec: true,
          question: { select: { title: true, category: true } },
          feedback: { select: { overallScore: true } },
        },
      },
    },
  });

  const items = rows.map((row): SessionHistoryItem => {
    const scores = row.answers.flatMap((answer) =>
      answer.feedback ? [answer.feedback.overallScore] : [],
    );
    return {
      id: row.id,
      submittedAt: row.submittedAt ?? row.startedAt,
      questions: row.answers.map((answer) => answer.question),
      answerCount: row.answers.length,
      scoredAnswers: scores.length,
      averageScore: scores.length ? mean(scores) : null,
      timeSpentSec: row.answers.reduce((sum, answer) => sum + answer.timeSpentSec, 0),
    };
  });

  return { items, page: current, pageCount, total };
}
