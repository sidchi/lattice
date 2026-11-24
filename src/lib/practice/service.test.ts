// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PracticeSessionStatus } from "@/generated/prisma/enums";
import { seedQuestionBank } from "@/lib/seed/seed";
import type { SeedData } from "@/lib/seed/schema";
import { createTestDatabase, type TestDatabase } from "@/test/db";

import {
  getSession,
  listSessions,
  saveProgress,
  startSession,
  submitSession,
  type Result,
} from "./service";
import { GRACE_PERIOD_SEC } from "./timer";

const MIN = 60;

/** Three questions with distinct, easy-to-sum time boxes. */
const fixture: SeedData = {
  companies: [],
  questions: [
    {
      slug: "design-cache",
      title: "Design a cache",
      prompt: "Design a cache: a synthetic prompt long enough to pass validation.",
      category: "SYSTEM_DESIGN",
      difficulty: "MEDIUM",
      timeLimitSec: 40 * MIN,
      companies: [],
    },
    {
      slug: "two-sum",
      title: "Two sum",
      prompt: "Two sum: a synthetic prompt long enough to pass validation.",
      category: "CODING",
      difficulty: "EASY",
      timeLimitSec: 20 * MIN,
      companies: [],
    },
    {
      slug: "lru",
      title: "LRU cache",
      prompt: "LRU cache: a synthetic prompt long enough to pass validation.",
      category: "CODING",
      difficulty: "MEDIUM",
      timeLimitSec: 30 * MIN,
      companies: [],
    },
  ],
};

const T0 = new Date("2026-11-23T10:00:00.000Z");
const at = (sec: number) => ({ now: new Date(T0.getTime() + sec * 1000) });

let db: TestDatabase;
let alice: string;
let bob: string;

beforeEach(async () => {
  db = createTestDatabase();
  await seedQuestionBank(db.prisma, fixture);
  alice = (await db.prisma.user.create({ data: { email: "alice@example.com" } })).id;
  bob = (await db.prisma.user.create({ data: { email: "bob@example.com" } })).id;
});

afterEach(async () => {
  await db.dispose();
});

function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`expected ok, got ${result.error}`);
  return result.value;
}

async function startOne(slug = "two-sum") {
  const { id } = unwrap(
    await startSession(db.prisma, alice, { mode: "question", question: slug }, at(0)),
  );
  const session = unwrap(await getSession(db.prisma, alice, id, at(0)));
  return { id, answerId: session.answers[0]!.id };
}

describe("startSession", () => {
  it("starts a single-question session with an empty answer and the question's time box", async () => {
    const { id } = await startOne("design-cache");
    const session = unwrap(await getSession(db.prisma, alice, id, at(0)));

    expect(session).toMatchObject({
      status: PracticeSessionStatus.IN_PROGRESS,
      timeLimitSec: 40 * MIN,
      startedAt: T0,
      deadline: new Date(T0.getTime() + 40 * MIN * 1000),
      submittedAt: null,
    });
    expect(session.answers).toHaveLength(1);
    expect(session.answers[0]).toMatchObject({
      position: 0,
      content: "",
      timeSpentSec: 0,
      question: { slug: "design-cache", title: "Design a cache", timeLimitSec: 40 * MIN },
    });
  });

  it("samples random questions within the filters and sums their time boxes", async () => {
    const { id } = unwrap(
      await startSession(
        db.prisma,
        alice,
        { mode: "random", category: "coding", difficulty: undefined, count: 3 },
        { ...at(0), random: () => 0 },
      ),
    );
    const session = unwrap(await getSession(db.prisma, alice, id, at(0)));

    // Only two coding questions exist; random() = 0 keeps slug order.
    expect(session.answers.map((a) => a.question.slug)).toEqual(["lru", "two-sum"]);
    expect(session.answers.map((a) => a.position)).toEqual([0, 1]);
    expect(session.timeLimitSec).toBe(50 * MIN);
  });

  it("fails cleanly when nothing matches", async () => {
    expect(
      await startSession(db.prisma, alice, { mode: "question", question: "nope" }, at(0)),
    ).toEqual({ ok: false, error: "no_questions" });
    expect(
      await startSession(
        db.prisma,
        alice,
        { mode: "random", category: "behavioral", difficulty: undefined, count: 1 },
        at(0),
      ),
    ).toEqual({ ok: false, error: "no_questions" });
  });
});

describe("getSession", () => {
  it("hides other users' sessions behind not_found", async () => {
    const { id } = await startOne();
    expect(await getSession(db.prisma, bob, id, at(0))).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(await getSession(db.prisma, alice, "missing", at(0))).toEqual({
      ok: false,
      error: "not_found",
    });
  });

  it("keeps a session open through the grace period", async () => {
    const { id } = await startOne();
    const session = unwrap(await getSession(db.prisma, alice, id, at(20 * MIN + GRACE_PERIOD_SEC)));
    expect(session.status).toBe(PracticeSessionStatus.IN_PROGRESS);
  });

  it("finalizes an expired session at its deadline when it is next opened", async () => {
    const { id } = await startOne();
    const session = unwrap(await getSession(db.prisma, alice, id, at(3 * 60 * MIN)));
    const deadline = new Date(T0.getTime() + 20 * MIN * 1000);

    expect(session.status).toBe(PracticeSessionStatus.SUBMITTED);
    expect(session.submittedAt).toEqual(deadline);
    const answer = await db.prisma.answer.findFirstOrThrow({ where: { sessionId: id } });
    expect(answer.submittedAt).toEqual(deadline);
  });
});

describe("saveProgress", () => {
  it("saves content and time spent", async () => {
    const { id, answerId } = await startOne();
    const result = await saveProgress(
      db.prisma,
      alice,
      id,
      [{ answerId, content: "Use a hash map", timeSpentSec: 120 }],
      at(120),
    );

    expect(result).toEqual({ ok: true, value: { savedAt: at(120).now } });
    const session = unwrap(await getSession(db.prisma, alice, id, at(121)));
    expect(session.answers[0]).toMatchObject({ content: "Use a hash map", timeSpentSec: 120 });
  });

  it("never lets time spent go backwards and caps it at the time box", async () => {
    const { id, answerId } = await startOne();
    await saveProgress(
      db.prisma,
      alice,
      id,
      [{ answerId, content: "a", timeSpentSec: 300 }],
      at(300),
    );
    // A stale second tab reports less time.
    await saveProgress(
      db.prisma,
      alice,
      id,
      [{ answerId, content: "b", timeSpentSec: 10 }],
      at(310),
    );
    let answer = await db.prisma.answer.findUniqueOrThrow({ where: { id: answerId } });
    expect(answer).toMatchObject({ content: "b", timeSpentSec: 300 });

    await saveProgress(
      db.prisma,
      alice,
      id,
      [{ answerId, content: "c", timeSpentSec: 99 * MIN }],
      at(320),
    );
    answer = await db.prisma.answer.findUniqueOrThrow({ where: { id: answerId } });
    expect(answer.timeSpentSec).toBe(20 * MIN);
  });

  it("rejects answers from another session without writing anything", async () => {
    const mine = await startOne("two-sum");
    const other = await startOne("lru");
    const result = await saveProgress(
      db.prisma,
      alice,
      mine.id,
      [
        { answerId: mine.answerId, content: "mine", timeSpentSec: 1 },
        { answerId: other.answerId, content: "hijack", timeSpentSec: 1 },
      ],
      at(5),
    );

    expect(result).toEqual({ ok: false, error: "invalid_answer" });
    const answers = await db.prisma.answer.findMany({ select: { content: true } });
    expect(answers.every((a) => a.content === "")).toBe(true);
  });

  it("does not let another user save into the session", async () => {
    const { id, answerId } = await startOne();
    expect(
      await saveProgress(db.prisma, bob, id, [{ answerId, content: "x", timeSpentSec: 1 }], at(5)),
    ).toEqual({ ok: false, error: "not_found" });
  });

  it("rejects saves after the grace period and finalizes the session", async () => {
    const { id, answerId } = await startOne();
    await saveProgress(
      db.prisma,
      alice,
      id,
      [{ answerId, content: "on time", timeSpentSec: 60 }],
      at(60),
    );

    const late = await saveProgress(
      db.prisma,
      alice,
      id,
      [{ answerId, content: "too late", timeSpentSec: 61 }],
      at(20 * MIN + GRACE_PERIOD_SEC + 1),
    );

    expect(late).toEqual({ ok: false, error: "expired" });
    const session = unwrap(await getSession(db.prisma, alice, id, at(30 * MIN)));
    expect(session.status).toBe(PracticeSessionStatus.SUBMITTED);
    expect(session.answers[0]!.content).toBe("on time");
  });

  it("rejects saves to a submitted session", async () => {
    const { id, answerId } = await startOne();
    await submitSession(db.prisma, alice, id, [], at(60));
    expect(
      await saveProgress(
        db.prisma,
        alice,
        id,
        [{ answerId, content: "x", timeSpentSec: 1 }],
        at(61),
      ),
    ).toEqual({ ok: false, error: "not_in_progress" });
  });
});

describe("submitSession", () => {
  it("saves the final drafts and submits", async () => {
    const { id, answerId } = await startOne();
    const result = await submitSession(
      db.prisma,
      alice,
      id,
      [{ answerId, content: "final", timeSpentSec: 600 }],
      at(600),
    );

    expect(result).toEqual({ ok: true, value: { submittedAt: at(600).now, draftsAccepted: true } });
    const session = unwrap(await getSession(db.prisma, alice, id, at(601)));
    expect(session.status).toBe(PracticeSessionStatus.SUBMITTED);
    expect(session.submittedAt).toEqual(at(600).now);
    expect(session.answers[0]!.content).toBe("final");
  });

  it("is idempotent: a second submit changes nothing", async () => {
    const { id, answerId } = await startOne();
    await submitSession(
      db.prisma,
      alice,
      id,
      [{ answerId, content: "first", timeSpentSec: 1 }],
      at(60),
    );
    const again = await submitSession(
      db.prisma,
      alice,
      id,
      [{ answerId, content: "second", timeSpentSec: 2 }],
      at(90),
    );

    expect(again).toEqual({ ok: true, value: { submittedAt: at(60).now, draftsAccepted: false } });
    const answer = await db.prisma.answer.findUniqueOrThrow({ where: { id: answerId } });
    expect(answer.content).toBe("first");
  });

  it("accepts drafts in the grace period but records the deadline as the submit time", async () => {
    const { id, answerId } = await startOne();
    const result = await submitSession(
      db.prisma,
      alice,
      id,
      [{ answerId, content: "just in time", timeSpentSec: 20 * MIN }],
      at(20 * MIN + 10),
    );
    const deadline = new Date(T0.getTime() + 20 * MIN * 1000);
    expect(result).toEqual({ ok: true, value: { submittedAt: deadline, draftsAccepted: true } });
  });

  it("ignores drafts after the grace period and keeps the last autosave", async () => {
    const { id, answerId } = await startOne();
    await saveProgress(
      db.prisma,
      alice,
      id,
      [{ answerId, content: "autosaved", timeSpentSec: 5 }],
      at(5),
    );
    const result = await submitSession(
      db.prisma,
      alice,
      id,
      [{ answerId, content: "late edit", timeSpentSec: 6 }],
      at(2 * 60 * MIN),
    );

    expect(result).toMatchObject({ ok: true, value: { draftsAccepted: false } });
    const answer = await db.prisma.answer.findUniqueOrThrow({ where: { id: answerId } });
    expect(answer.content).toBe("autosaved");
  });

  it("does not let another user submit the session", async () => {
    const { id } = await startOne();
    expect(await submitSession(db.prisma, bob, id, [], at(5))).toEqual({
      ok: false,
      error: "not_found",
    });
  });

  it("rolls back the drafts if any answer id is invalid", async () => {
    const { id, answerId } = await startOne();
    const result = await submitSession(
      db.prisma,
      alice,
      id,
      [
        { answerId, content: "partial", timeSpentSec: 1 },
        { answerId: "not-mine", content: "x", timeSpentSec: 1 },
      ],
      at(5),
    );
    expect(result).toEqual({ ok: false, error: "invalid_answer" });
    const session = unwrap(await getSession(db.prisma, alice, id, at(6)));
    expect(session.status).toBe(PracticeSessionStatus.IN_PROGRESS);
    expect(session.answers[0]!.content).toBe("");
  });

  it("refuses an abandoned session", async () => {
    const { id } = await startOne();
    await db.prisma.practiceSession.update({
      where: { id },
      data: { status: PracticeSessionStatus.ABANDONED },
    });
    expect(await submitSession(db.prisma, alice, id, [], at(5))).toEqual({
      ok: false,
      error: "not_in_progress",
    });
  });
});

describe("listSessions", () => {
  it("lists only the user's sessions, newest first, with question titles", async () => {
    await startSession(db.prisma, alice, { mode: "question", question: "two-sum" }, at(0));
    await startSession(db.prisma, alice, { mode: "question", question: "lru" }, at(100));
    await startSession(db.prisma, bob, { mode: "question", question: "design-cache" }, at(200));

    const sessions = await listSessions(db.prisma, alice);
    expect(sessions.map((s) => s.questionTitles)).toEqual([["LRU cache"], ["Two sum"]]);
    expect(sessions[0]).toMatchObject({
      status: PracticeSessionStatus.IN_PROGRESS,
      startedAt: at(100).now,
      deadline: new Date(T0.getTime() + (100 + 30 * MIN) * 1000),
      submittedAt: null,
    });
    expect(await listSessions(db.prisma, alice, { limit: 1 })).toHaveLength(1);
  });
});
