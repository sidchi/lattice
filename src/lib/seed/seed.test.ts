// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestDatabase, type TestDatabase } from "@/test/db";

import { companies, questions } from "./questions";
import type { QuestionSeed } from "./schema";
import { SeedDataError } from "./schema";
import { seedQuestionBank } from "./seed";

let db: TestDatabase;

beforeEach(() => {
  db = createTestDatabase();
});

afterEach(async () => {
  await db.dispose();
});

describe("seedQuestionBank", () => {
  it("loads every company, question and company tag", async () => {
    const summary = await seedQuestionBank(db.prisma);

    expect(summary).toEqual({
      companies: companies.length,
      questionsCreated: questions.length,
      questionsUpdated: 0,
    });
    expect(await db.prisma.company.count()).toBe(companies.length);
    expect(await db.prisma.question.count()).toBe(questions.length);
    expect(await db.prisma.questionCompany.count()).toBe(
      questions.reduce((n, q) => n + q.companies.length, 0),
    );
  });

  it("is idempotent", async () => {
    await seedQuestionBank(db.prisma);
    const summary = await seedQuestionBank(db.prisma);

    expect(summary.questionsCreated).toBe(0);
    expect(summary.questionsUpdated).toBe(questions.length);
    expect(await db.prisma.question.count()).toBe(questions.length);
    expect(await db.prisma.company.count()).toBe(companies.length);
  });

  it("applies the default time limit unless a question overrides it", async () => {
    const base: QuestionSeed = {
      slug: "quick-one",
      title: "Quick one",
      prompt: "A short coding warm-up that should not take long.",
      category: "CODING",
      difficulty: "EASY",
      companies: [],
    };
    await seedQuestionBank(db.prisma, {
      companies: [],
      questions: [base, { ...base, slug: "custom-limit", timeLimitSec: 600 }],
    });

    const rows = await db.prisma.question.findMany({
      select: { slug: true, timeLimitSec: true },
      orderBy: { slug: "asc" },
    });
    expect(rows).toEqual([
      { slug: "custom-limit", timeLimitSec: 600 },
      { slug: "quick-one", timeLimitSec: 20 * 60 },
    ]);
  });

  it("updates edited questions in place and replaces their company tags", async () => {
    await seedQuestionBank(db.prisma);
    const before = await db.prisma.question.findUniqueOrThrow({ where: { slug: "two-sum" } });

    const edited = questions.map((q) =>
      q.slug === "two-sum" ? { ...q, title: "Two sum (revised)", companies: ["stripe"] } : q,
    );
    await seedQuestionBank(db.prisma, { companies, questions: edited });

    const after = await db.prisma.question.findUniqueOrThrow({
      where: { slug: "two-sum" },
      include: { companies: { include: { company: true } } },
    });
    expect(after.id).toBe(before.id);
    expect(after.title).toBe("Two sum (revised)");
    expect(after.companies.map((c) => c.company.slug)).toEqual(["stripe"]);
  });

  it("keeps questions that were removed from the seed data", async () => {
    await seedQuestionBank(db.prisma);
    await seedQuestionBank(db.prisma, { companies, questions: questions.slice(1) });

    expect(await db.prisma.question.count()).toBe(questions.length);
  });

  it("validates before writing anything", async () => {
    const bad = { companies, questions: [...questions, questions[0]!] };

    await expect(seedQuestionBank(db.prisma, bad)).rejects.toThrow(SeedDataError);
    expect(await db.prisma.question.count()).toBe(0);
  });

  it("supports filtering by company, category and difficulty", async () => {
    await seedQuestionBank(db.prisma);

    const stripeHard = await db.prisma.question.findMany({
      where: {
        difficulty: "HARD",
        category: "SYSTEM_DESIGN",
        companies: { some: { company: { slug: "stripe" } } },
      },
      select: { slug: true },
      orderBy: { slug: "asc" },
    });
    expect(stripeHard.map((q) => q.slug)).toEqual([
      "design-payment-idempotency",
      "design-subscription-billing",
    ]);
  });
});
