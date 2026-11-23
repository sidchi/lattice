// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Difficulty, QuestionCategory } from "@/generated/prisma/enums";
import { seedQuestionBank } from "@/lib/seed/seed";
import type { SeedData } from "@/lib/seed/schema";
import { createTestDatabase, type TestDatabase } from "@/test/db";

import { getQuestionBySlug, getQuestionFacets, listQuestions } from "./repository";

/** Small, hand-countable fixture so every expected number below can be checked by eye. */
const fixture: SeedData = {
  companies: [
    { slug: "stripe", name: "Stripe" },
    { slug: "amazon", name: "Amazon" },
    { slug: "netflix", name: "Netflix" },
  ],
  questions: [
    q("design-idempotency", "Design idempotent payments", "SYSTEM_DESIGN", "HARD", [
      "stripe",
      "amazon",
    ]),
    q("design-cache", "Design a cache", "SYSTEM_DESIGN", "MEDIUM", ["amazon"]),
    q("conflict", "A conflict with a teammate", "BEHAVIORAL", "EASY", []),
    q("two-sum", "Two sum", "CODING", "EASY", ["amazon"]),
    q("lru", "LRU cache", "CODING", "MEDIUM", ["stripe"]),
    q("median-stream", "Median of a stream", "CODING", "HARD", []),
  ],
};

function q(
  slug: string,
  title: string,
  category: QuestionCategory,
  difficulty: Difficulty,
  companies: string[],
) {
  return {
    slug,
    title,
    prompt: `${title}: a synthetic prompt long enough to pass validation.`,
    category,
    difficulty,
    companies,
  };
}

let db: TestDatabase;

beforeEach(async () => {
  db = createTestDatabase();
  await seedQuestionBank(db.prisma, fixture);
});

afterEach(async () => {
  await db.dispose();
});

describe("listQuestions", () => {
  it("returns every question ordered by title with company tags", async () => {
    const result = await listQuestions(db.prisma, { page: 1 });

    expect(result.total).toBe(6);
    expect(result.pageCount).toBe(1);
    expect(result.items.map((item) => item.title)).toEqual([
      "A conflict with a teammate",
      "Design a cache",
      "Design idempotent payments",
      "LRU cache",
      "Median of a stream",
      "Two sum",
    ]);
    expect(result.items[2]).toEqual({
      slug: "design-idempotency",
      title: "Design idempotent payments",
      category: QuestionCategory.SYSTEM_DESIGN,
      difficulty: Difficulty.HARD,
      timeLimitSec: 45 * 60,
      // Sorted by company name, not by insertion order.
      companies: [
        { slug: "amazon", name: "Amazon" },
        { slug: "stripe", name: "Stripe" },
      ],
    });
  });

  it("combines filters with AND", async () => {
    const result = await listQuestions(db.prisma, {
      category: QuestionCategory.CODING,
      company: "amazon",
      page: 1,
    });
    expect(result.items.map((item) => item.slug)).toEqual(["two-sum"]);
    expect(result.total).toBe(1);
  });

  it("filters by difficulty", async () => {
    const result = await listQuestions(db.prisma, { difficulty: Difficulty.EASY, page: 1 });
    expect(result.items.map((item) => item.slug)).toEqual(["conflict", "two-sum"]);
  });

  it("matches nothing for an unknown company", async () => {
    const result = await listQuestions(db.prisma, { company: "nope", page: 1 });
    expect(result).toEqual({ items: [], total: 0, page: 1, pageCount: 1 });
  });

  it("paginates without overlap or gaps", async () => {
    const pages = await Promise.all([1, 2, 3].map((page) => listQuestions(db.prisma, { page }, 2)));
    expect(pages.map((p) => p.pageCount)).toEqual([3, 3, 3]);
    const slugs = pages.flatMap((p) => p.items.map((item) => item.slug));
    expect(slugs).toHaveLength(6);
    expect(new Set(slugs).size).toBe(6);
  });

  it("clamps a page past the end to the last page", async () => {
    const result = await listQuestions(db.prisma, { page: 99 }, 4);
    expect(result.page).toBe(2);
    expect(result.items).toHaveLength(2);
  });
});

describe("getQuestionFacets", () => {
  it("counts every option, including zeros, with no filters", async () => {
    const facets = await getQuestionFacets(db.prisma, { page: 1 });

    expect(facets.categories).toEqual([
      { value: QuestionCategory.SYSTEM_DESIGN, count: 2 },
      { value: QuestionCategory.BEHAVIORAL, count: 1 },
      { value: QuestionCategory.CODING, count: 3 },
    ]);
    expect(facets.difficulties).toEqual([
      { value: Difficulty.EASY, count: 2 },
      { value: Difficulty.MEDIUM, count: 2 },
      { value: Difficulty.HARD, count: 2 },
    ]);
    expect(facets.companies).toEqual([
      { slug: "amazon", name: "Amazon", count: 3 },
      { slug: "netflix", name: "Netflix", count: 0 },
      { slug: "stripe", name: "Stripe", count: 2 },
    ]);
  });

  it("applies every other filter to each facet but not its own", async () => {
    const facets = await getQuestionFacets(db.prisma, {
      category: QuestionCategory.CODING,
      company: "stripe",
      page: 1,
    });

    // Category ignores category=coding but respects company=stripe.
    expect(facets.categories).toEqual([
      { value: QuestionCategory.SYSTEM_DESIGN, count: 1 },
      { value: QuestionCategory.BEHAVIORAL, count: 0 },
      { value: QuestionCategory.CODING, count: 1 },
    ]);
    // Difficulty respects both.
    expect(facets.difficulties).toEqual([
      { value: Difficulty.EASY, count: 0 },
      { value: Difficulty.MEDIUM, count: 1 },
      { value: Difficulty.HARD, count: 0 },
    ]);
    // Company ignores company=stripe but respects category=coding.
    expect(facets.companies.map(({ slug, count }) => [slug, count])).toEqual([
      ["amazon", 1],
      ["netflix", 0],
      ["stripe", 1],
    ]);
  });
});

describe("getQuestionBySlug", () => {
  it("returns the full question", async () => {
    const question = await getQuestionBySlug(db.prisma, "lru");
    expect(question).toEqual({
      slug: "lru",
      title: "LRU cache",
      prompt: "LRU cache: a synthetic prompt long enough to pass validation.",
      category: QuestionCategory.CODING,
      difficulty: Difficulty.MEDIUM,
      timeLimitSec: 30 * 60,
      companies: [{ slug: "stripe", name: "Stripe" }],
    });
  });

  it("returns null for an unknown slug", async () => {
    expect(await getQuestionBySlug(db.prisma, "missing")).toBeNull();
  });
});

describe("with the real seed data", () => {
  it("facet totals add up to the question count", async () => {
    const real = createTestDatabase();
    try {
      await seedQuestionBank(real.prisma);
      const [all, facets] = await Promise.all([
        listQuestions(real.prisma, { page: 1 }),
        getQuestionFacets(real.prisma, { page: 1 }),
      ]);
      const sum = (rows: { count: number }[]) => rows.reduce((n, row) => n + row.count, 0);
      expect(all.total).toBeGreaterThanOrEqual(50);
      expect(sum(facets.categories)).toBe(all.total);
      expect(sum(facets.difficulties)).toBe(all.total);
    } finally {
      await real.dispose();
    }
  });
});
