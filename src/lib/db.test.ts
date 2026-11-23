// @vitest-environment node
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/db";
import { createTestDatabase, readMigrations, type TestDatabase } from "@/test/db";

describe("committed migrations", () => {
  // CI also runs `prisma migrate diff` against a migrated database; this is the fast local
  // guard that the hand-maintained SQL and the Prisma schema have not drifted apart.
  const raw = new Database(":memory:");
  for (const sql of readMigrations()) raw.exec(sql);

  const scalarFields: Record<Prisma.ModelName, Record<string, string>> = {
    User: Prisma.UserScalarFieldEnum,
    Company: Prisma.CompanyScalarFieldEnum,
    Question: Prisma.QuestionScalarFieldEnum,
    QuestionCompany: Prisma.QuestionCompanyScalarFieldEnum,
    PracticeSession: Prisma.PracticeSessionScalarFieldEnum,
    Answer: Prisma.AnswerScalarFieldEnum,
    Feedback: Prisma.FeedbackScalarFieldEnum,
    FeedbackScore: Prisma.FeedbackScoreScalarFieldEnum,
  };

  it("create exactly the tables in the Prisma schema", () => {
    const tables = raw
      .prepare<[], { name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
      )
      .all()
      .map((t) => t.name);
    expect(new Set(tables)).toEqual(new Set(Object.values(Prisma.ModelName)));
  });

  it.each(Object.values(Prisma.ModelName))("give %s exactly its schema columns", (model) => {
    const columns = raw
      .prepare<[], { name: string }>(`SELECT name FROM pragma_table_info('${model}')`)
      .all()
      .map((c) => c.name);
    expect(new Set(columns)).toEqual(new Set(Object.values(scalarFields[model])));
  });
});

describe("data model constraints", () => {
  let db: TestDatabase;

  beforeEach(() => {
    db = createTestDatabase();
  });

  afterEach(async () => {
    await db.dispose();
  });

  async function seedSessionWithFeedback() {
    const question = await db.prisma.question.create({
      data: {
        slug: "q",
        title: "Question",
        prompt: "Explain something in detail.",
        category: "BEHAVIORAL",
        difficulty: "EASY",
        timeLimitSec: 480,
      },
    });
    const user = await db.prisma.user.create({ data: { email: "candidate@example.com" } });
    const session = await db.prisma.practiceSession.create({
      data: {
        userId: user.id,
        timeLimitSec: 480,
        answers: {
          create: {
            questionId: question.id,
            position: 0,
            feedback: {
              create: {
                overallScore: 3,
                summary: "Clear structure, light on impact.",
                evaluator: "mock",
                scores: {
                  create: [
                    { dimension: "structure", score: 4 },
                    { dimension: "impact", score: 2, comment: "Quantify the outcome." },
                  ],
                },
              },
            },
          },
        },
      },
      include: { answers: true },
    });
    return { question, user, session };
  }

  it("applies defaults for new sessions and answers", async () => {
    const { session } = await seedSessionWithFeedback();

    expect(session.status).toBe("IN_PROGRESS");
    expect(session.submittedAt).toBeNull();
    expect(session.answers[0]).toMatchObject({ content: "", timeSpentSec: 0, submittedAt: null });
  });

  it("deletes a user's sessions, answers and feedback with the user", async () => {
    const { user } = await seedSessionWithFeedback();

    await db.prisma.user.delete({ where: { id: user.id } });

    expect(await db.prisma.practiceSession.count()).toBe(0);
    expect(await db.prisma.answer.count()).toBe(0);
    expect(await db.prisma.feedback.count()).toBe(0);
    expect(await db.prisma.feedbackScore.count()).toBe(0);
    expect(await db.prisma.question.count()).toBe(1);
  });

  it("refuses to delete a question that has answers", async () => {
    const { question } = await seedSessionWithFeedback();

    await expect(db.prisma.question.delete({ where: { id: question.id } })).rejects.toThrow();
    expect(await db.prisma.question.count()).toBe(1);
  });

  it("allows one answer per question per session", async () => {
    const { question, session } = await seedSessionWithFeedback();

    await expect(
      db.prisma.answer.create({
        data: { sessionId: session.id, questionId: question.id, position: 1 },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("allows one feedback per answer", async () => {
    const { session } = await seedSessionWithFeedback();

    await expect(
      db.prisma.feedback.create({
        data: {
          answerId: session.answers[0]!.id,
          overallScore: 1,
          summary: "x",
          evaluator: "mock",
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("aggregates rubric scores by dimension", async () => {
    await seedSessionWithFeedback();

    const byDimension = await db.prisma.feedbackScore.groupBy({
      by: ["dimension"],
      _avg: { score: true },
      orderBy: { dimension: "asc" },
    });
    expect(byDimension).toEqual([
      { dimension: "impact", _avg: { score: 2 } },
      { dimension: "structure", _avg: { score: 4 } },
    ]);
  });
});

describe("getPrisma", () => {
  afterEach(async () => {
    const cached = (globalThis as { prisma?: { $disconnect(): Promise<void> } }).prisma;
    await cached?.$disconnect();
    delete (globalThis as { prisma?: unknown }).prisma;
  });

  it("reuses one client outside production so hot reloads do not leak connections", () => {
    expect(getPrisma()).toBe(getPrisma());
  });
});
