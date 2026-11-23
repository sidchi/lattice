import { describe, expect, it } from "vitest";

import { Difficulty, QuestionCategory } from "@/generated/prisma/enums";

import {
  categoryLabel,
  categoryOptions,
  difficultyLabel,
  difficultyOptions,
  formatTimeLimit,
  hasActiveFilters,
  parseQuestionFilters,
  questionsHref,
  requestedHref,
  type QuestionFilters,
} from "./filters";

describe("parseQuestionFilters", () => {
  it("returns page 1 and no filters for an empty query", () => {
    expect(parseQuestionFilters({})).toEqual({
      category: undefined,
      difficulty: undefined,
      company: undefined,
      page: 1,
    });
  });

  it("maps URL slugs to enum values", () => {
    expect(
      parseQuestionFilters({
        category: "system-design",
        difficulty: "hard",
        company: "stripe",
        page: "3",
      }),
    ).toEqual({
      category: QuestionCategory.SYSTEM_DESIGN,
      difficulty: Difficulty.HARD,
      company: "stripe",
      page: 3,
    });
  });

  it("is case- and whitespace-insensitive", () => {
    expect(parseQuestionFilters({ category: " Coding ", difficulty: "EASY" })).toMatchObject({
      category: QuestionCategory.CODING,
      difficulty: Difficulty.EASY,
    });
  });

  it("uses the first value when a parameter is repeated", () => {
    expect(parseQuestionFilters({ category: ["behavioral", "coding"] }).category).toBe(
      QuestionCategory.BEHAVIORAL,
    );
  });

  it("drops unknown values instead of failing", () => {
    expect(
      parseQuestionFilters({
        category: "SYSTEM_DESIGN", // enum name, not the public slug
        difficulty: "impossible",
        company: "../etc/passwd",
      }),
    ).toEqual({ category: undefined, difficulty: undefined, company: undefined, page: 1 });
  });

  it.each([
    ["0", 1],
    ["-2", 1],
    ["1.5", 1],
    ["abc", 1],
    ["", 1],
    ["7", 7],
    ["999999999", 10_000],
  ])("parses page %j as %d", (raw, expected) => {
    expect(parseQuestionFilters({ page: raw }).page).toBe(expected);
  });
});

describe("questionsHref", () => {
  const none: QuestionFilters = { page: 1 };

  it("is the bare path with no filters", () => {
    expect(questionsHref(none)).toBe("/questions");
  });

  it("emits parameters in a fixed order and omits page 1", () => {
    expect(
      questionsHref({
        company: "stripe",
        difficulty: Difficulty.MEDIUM,
        category: QuestionCategory.CODING,
        page: 1,
      }),
    ).toBe("/questions?category=coding&difficulty=medium&company=stripe");
  });

  it("round-trips through parseQuestionFilters", () => {
    const filters: QuestionFilters = {
      category: QuestionCategory.BEHAVIORAL,
      difficulty: Difficulty.EASY,
      company: "amazon",
      page: 2,
    };
    const params = Object.fromEntries(new URL(questionsHref(filters), "http://x").searchParams);
    expect(parseQuestionFilters(params)).toEqual(filters);
  });

  it("keeps the page when only the page changes", () => {
    const filters = { category: QuestionCategory.CODING, page: 2 };
    expect(questionsHref(filters, { page: 3 })).toBe("/questions?category=coding&page=3");
    expect(questionsHref(filters)).toBe("/questions?category=coding&page=2");
  });

  it("resets to page 1 when a filter changes", () => {
    const filters = { category: QuestionCategory.CODING, page: 4 };
    expect(questionsHref(filters, { difficulty: Difficulty.HARD })).toBe(
      "/questions?category=coding&difficulty=hard",
    );
  });

  it("clears a filter when overridden with undefined", () => {
    const filters = { category: QuestionCategory.CODING, company: "meta", page: 2 };
    expect(questionsHref(filters, { company: undefined })).toBe("/questions?category=coding");
  });

  it("does not reset the page when a filter is set to its current value", () => {
    const filters = { category: QuestionCategory.CODING, page: 2 };
    expect(questionsHref(filters, { category: QuestionCategory.CODING })).toBe(
      "/questions?category=coding&page=2",
    );
  });
});

describe("hasActiveFilters", () => {
  it("ignores pagination", () => {
    expect(hasActiveFilters({ page: 5 })).toBe(false);
    expect(hasActiveFilters({ company: "uber", page: 1 })).toBe(true);
  });
});

describe("labels", () => {
  it("covers every enum value", () => {
    expect(categoryOptions.map((o) => o.value).sort()).toEqual(
      Object.values(QuestionCategory).sort(),
    );
    expect(difficultyOptions.map((o) => o.value).sort()).toEqual(Object.values(Difficulty).sort());
    expect(categoryLabel(QuestionCategory.SYSTEM_DESIGN)).toBe("System design");
    expect(difficultyLabel(Difficulty.MEDIUM)).toBe("Medium");
  });
});

describe("formatTimeLimit", () => {
  it.each([
    [8 * 60, "8 min"],
    [45 * 60, "45 min"],
    [60 * 60, "1 h"],
    [90 * 60, "1 h 30 min"],
    [10, "1 min"],
  ])("formats %d seconds as %j", (seconds, expected) => {
    expect(formatTimeLimit(seconds)).toBe(expected);
  });
});

describe("requestedHref", () => {
  it("rebuilds the query in its original order, including empty and repeated values", () => {
    expect(requestedHref({})).toBe("/questions");
    expect(requestedHref({ company: "", category: ["coding", "behavioral"] })).toBe(
      "/questions?company=&category=coding&category=behavioral",
    );
  });

  it("equals the canonical href for a canonical URL", () => {
    const href = "/questions?category=coding&difficulty=hard&page=2";
    const params = Object.fromEntries(new URL(href, "http://x").searchParams);
    expect(requestedHref(params)).toBe(questionsHref(parseQuestionFilters(params)));
  });
});
