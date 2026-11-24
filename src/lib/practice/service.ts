import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { PracticeSessionStatus } from "@/generated/prisma/enums";
import type { Difficulty, QuestionCategory } from "@/generated/prisma/enums";
import { categoryOptions, difficultyOptions } from "@/lib/questions/filters";

import type { AnswerDraft, StartSessionInput } from "./schemas";
import { type RandomSource, sampleQuestions, sessionTimeLimit } from "./selection";
import { isPastGrace, sessionDeadline } from "./timer";

/**
 * Practice-session lifecycle: start, load, autosave, submit.
 *
 * Rules enforced here rather than in the UI, because server actions are reachable by anyone
 * with a session cookie:
 *
 * - **Ownership.** Every lookup is scoped by `userId`. Another user's session id behaves
 *   exactly like a nonexistent one (`not_found`), so ids cannot be probed.
 * - **One-way status.** `IN_PROGRESS → SUBMITTED` only. Writes are guarded by a conditional
 *   update on the status inside the same transaction, so an autosave that races the final
 *   submit cannot modify a submitted session.
 * - **Server-side clock.** Saves are accepted until the deadline plus a short grace period.
 *   After that the session is finalized with whatever was last saved. Expiry is applied
 *   lazily, on the next read or write, so no background job is needed.
 * - **Idempotent submit.** Submitting an already submitted session succeeds without changes,
 *   so a double-click or a retried request is harmless.
 *
 * Like the question repository, functions take the Prisma client as an argument so tests
 * run them against a real, throwaway SQLite database.
 */

export type PracticeError =
  /** Unknown id, or a session that belongs to someone else. */
  | "not_found"
  /** The session was already submitted (or abandoned). */
  | "not_in_progress"
  /** The deadline and grace period have passed; the session has been finalized. */
  | "expired"
  /** No question matches the requested selection. */
  | "no_questions"
  /** An answer id that is not part of this session. */
  | "invalid_answer";

export type Result<T> = { ok: true; value: T } | { ok: false; error: PracticeError };

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = <T>(error: PracticeError): Result<T> => ({ ok: false, error });

export type PracticeAnswerView = {
  id: string;
  position: number;
  content: string;
  timeSpentSec: number;
  question: {
    slug: string;
    title: string;
    prompt: string;
    category: QuestionCategory;
    difficulty: Difficulty;
    timeLimitSec: number;
  };
};

export type PracticeSessionView = {
  id: string;
  status: PracticeSessionStatus;
  timeLimitSec: number;
  startedAt: Date;
  deadline: Date;
  submittedAt: Date | null;
  answers: PracticeAnswerView[];
};

export type PracticeSessionSummary = {
  id: string;
  status: PracticeSessionStatus;
  startedAt: Date;
  deadline: Date;
  submittedAt: Date | null;
  questionTitles: string[];
};

type Clock = { now?: Date };

const sessionInclude = {
  answers: {
    orderBy: { position: "asc" },
    select: {
      id: true,
      position: true,
      content: true,
      timeSpentSec: true,
      question: {
        select: {
          slug: true,
          title: true,
          prompt: true,
          category: true,
          difficulty: true,
          timeLimitSec: true,
        },
      },
    },
  },
} satisfies Prisma.PracticeSessionInclude;

type SessionRow = Prisma.PracticeSessionGetPayload<{ include: typeof sessionInclude }>;

function toView(row: SessionRow): PracticeSessionView {
  return {
    id: row.id,
    status: row.status,
    timeLimitSec: row.timeLimitSec,
    startedAt: row.startedAt,
    deadline: sessionDeadline(row.startedAt, row.timeLimitSec),
    submittedAt: row.submittedAt,
    answers: row.answers,
  };
}

type Tx = Prisma.TransactionClient;

/**
 * Flips an in-progress session to SUBMITTED. Returns false if it was not in progress, which
 * is how concurrent writers find out they lost the race. Stamps every answer with the same
 * submission time.
 */
async function finalize(tx: Tx, sessionId: string, submittedAt: Date): Promise<boolean> {
  const { count } = await tx.practiceSession.updateMany({
    where: { id: sessionId, status: PracticeSessionStatus.IN_PROGRESS },
    data: { status: PracticeSessionStatus.SUBMITTED, submittedAt },
  });
  if (count === 0) return false;
  await tx.answer.updateMany({ where: { sessionId }, data: { submittedAt } });
  return true;
}

/**
 * Writes answer drafts. Content is replaced; time spent only ever grows (a stale tab cannot
 * reduce it) and is capped at the session time box.
 */
async function writeDrafts(
  tx: Tx,
  session: { id: string; timeLimitSec: number },
  drafts: readonly AnswerDraft[],
): Promise<Result<void>> {
  if (drafts.length === 0) return ok(undefined);

  const existing = await tx.answer.findMany({
    where: { sessionId: session.id, id: { in: drafts.map((draft) => draft.answerId) } },
    select: { id: true, timeSpentSec: true },
  });
  if (existing.length !== drafts.length) return fail("invalid_answer");
  const spent = new Map(existing.map((answer) => [answer.id, answer.timeSpentSec]));

  for (const draft of drafts) {
    const timeSpentSec = Math.min(
      session.timeLimitSec,
      Math.max(spent.get(draft.answerId) ?? 0, draft.timeSpentSec),
    );
    await tx.answer.update({
      where: { id: draft.answerId },
      data: { content: draft.content, timeSpentSec },
    });
  }
  return ok(undefined);
}

async function findOwned(prisma: PrismaClient | Tx, userId: string, sessionId: string) {
  return prisma.practiceSession.findFirst({
    where: { id: sessionId, userId },
    include: sessionInclude,
  });
}

/**
 * Creates a session for `userId` with the questions chosen by `input`, answers pre-created
 * (empty) in display order so autosave is a plain update.
 */
export async function startSession(
  prisma: PrismaClient,
  userId: string,
  input: StartSessionInput,
  { now = new Date(), random }: Clock & { random?: RandomSource } = {},
): Promise<Result<{ id: string }>> {
  let picked: { id: string; timeLimitSec: number }[];

  if (input.mode === "question") {
    const question = await prisma.question.findUnique({
      where: { slug: input.question },
      select: { id: true, timeLimitSec: true },
    });
    picked = question ? [question] : [];
  } else {
    const category = categoryOptions.find((option) => option.slug === input.category)?.value;
    const difficulty = difficultyOptions.find((option) => option.slug === input.difficulty)?.value;
    const candidates = await prisma.question.findMany({
      where: { ...(category && { category }), ...(difficulty && { difficulty }) },
      select: { id: true, timeLimitSec: true },
      // Stable input order, so a seeded random source gives a reproducible pick.
      orderBy: { slug: "asc" },
    });
    picked = sampleQuestions(candidates, input.count, random);
  }

  if (picked.length === 0) return fail("no_questions");

  const session = await prisma.practiceSession.create({
    data: {
      userId,
      timeLimitSec: sessionTimeLimit(picked),
      startedAt: now,
      answers: {
        create: picked.map((question, position) => ({ questionId: question.id, position })),
      },
    },
    select: { id: true },
  });
  return ok(session);
}

/**
 * Loads a session for its owner. An in-progress session whose grace period has passed is
 * finalized first (submitted at its deadline), so callers always see the true status.
 */
export async function getSession(
  prisma: PrismaClient,
  userId: string,
  sessionId: string,
  { now = new Date() }: Clock = {},
): Promise<Result<PracticeSessionView>> {
  const row = await findOwned(prisma, userId, sessionId);
  if (!row) return fail("not_found");

  const deadline = sessionDeadline(row.startedAt, row.timeLimitSec);
  if (row.status === PracticeSessionStatus.IN_PROGRESS && isPastGrace(deadline, now)) {
    await prisma.$transaction((tx) => finalize(tx, row.id, deadline));
    const refreshed = await findOwned(prisma, userId, sessionId);
    return refreshed ? ok(toView(refreshed)) : fail("not_found");
  }
  return ok(toView(row));
}

/** Autosave. Fails with `expired` (and finalizes) once the grace period is over. */
export async function saveProgress(
  prisma: PrismaClient,
  userId: string,
  sessionId: string,
  drafts: readonly AnswerDraft[],
  { now = new Date() }: Clock = {},
): Promise<Result<{ savedAt: Date }>> {
  return prisma.$transaction(async (tx): Promise<Result<{ savedAt: Date }>> => {
    const session = await tx.practiceSession.findFirst({
      where: { id: sessionId, userId },
      select: { id: true, status: true, startedAt: true, timeLimitSec: true },
    });
    if (!session) return fail("not_found");
    if (session.status !== PracticeSessionStatus.IN_PROGRESS) return fail("not_in_progress");

    const deadline = sessionDeadline(session.startedAt, session.timeLimitSec);
    if (isPastGrace(deadline, now)) {
      await finalize(tx, session.id, deadline);
      return fail("expired");
    }

    const written = await writeDrafts(tx, session, drafts);
    if (!written.ok) return fail(written.error);
    return ok({ savedAt: now });
  });
}

/**
 * Final submit: saves the last drafts (if still within the grace period) and marks the
 * session submitted. Submitting twice is a no-op success. Past the grace period the drafts
 * are ignored and the session is finalized with what was last autosaved.
 */
export async function submitSession(
  prisma: PrismaClient,
  userId: string,
  sessionId: string,
  drafts: readonly AnswerDraft[],
  { now = new Date() }: Clock = {},
): Promise<Result<{ submittedAt: Date; draftsAccepted: boolean }>> {
  type Value = { submittedAt: Date; draftsAccepted: boolean };
  return prisma.$transaction(async (tx): Promise<Result<Value>> => {
    const session = await tx.practiceSession.findFirst({
      where: { id: sessionId, userId },
      select: { id: true, status: true, startedAt: true, timeLimitSec: true, submittedAt: true },
    });
    if (!session) return fail("not_found");
    if (session.status === PracticeSessionStatus.SUBMITTED && session.submittedAt) {
      return ok({ submittedAt: session.submittedAt, draftsAccepted: false });
    }
    if (session.status !== PracticeSessionStatus.IN_PROGRESS) return fail("not_in_progress");

    const deadline = sessionDeadline(session.startedAt, session.timeLimitSec);
    if (isPastGrace(deadline, now)) {
      await finalize(tx, session.id, deadline);
      return ok({ submittedAt: deadline, draftsAccepted: false });
    }

    const written = await writeDrafts(tx, session, drafts);
    if (!written.ok) return fail(written.error);
    // Inside the grace period the recorded time is capped at the deadline: the session
    // cannot have been submitted later than it ended.
    const submittedAt = now.getTime() > deadline.getTime() ? deadline : now;
    await finalize(tx, session.id, submittedAt);
    return ok({ submittedAt, draftsAccepted: true });
  });
}

/**
 * Applies lazy expiry to every one of the user's sessions at once: each in-progress session
 * whose grace period has passed is submitted at its deadline, exactly as `getSession` would
 * do on open. Aggregate reads (history, progress) call this first so a session abandoned in
 * a closed tab counts as submitted without having to be opened. Returns how many sessions
 * were finalized.
 */
export async function finalizeExpiredSessions(
  prisma: PrismaClient,
  userId: string,
  { now = new Date() }: Clock = {},
): Promise<number> {
  const open = await prisma.practiceSession.findMany({
    where: { userId, status: PracticeSessionStatus.IN_PROGRESS },
    select: { id: true, startedAt: true, timeLimitSec: true },
  });
  const expired = open
    .map((session) => ({
      id: session.id,
      deadline: sessionDeadline(session.startedAt, session.timeLimitSec),
    }))
    .filter((session) => isPastGrace(session.deadline, now));
  if (expired.length === 0) return 0;

  // Each finalize is its own conditional update, so a concurrent submit simply wins.
  const results = await prisma.$transaction(async (tx) => {
    const flipped: boolean[] = [];
    for (const session of expired) flipped.push(await finalize(tx, session.id, session.deadline));
    return flipped;
  });
  return results.filter(Boolean).length;
}

/** The user's sessions, newest first, for the practice landing page. */
export async function listSessions(
  prisma: PrismaClient,
  userId: string,
  { limit = 10 }: { limit?: number } = {},
): Promise<PracticeSessionSummary[]> {
  const rows = await prisma.practiceSession.findMany({
    where: { userId },
    orderBy: { startedAt: "desc" },
    take: limit,
    select: {
      id: true,
      status: true,
      startedAt: true,
      timeLimitSec: true,
      submittedAt: true,
      answers: { orderBy: { position: "asc" }, select: { question: { select: { title: true } } } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    status: row.status,
    startedAt: row.startedAt,
    deadline: sessionDeadline(row.startedAt, row.timeLimitSec),
    submittedAt: row.submittedAt,
    questionTitles: row.answers.map((answer) => answer.question.title),
  }));
}
