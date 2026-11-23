import { describe, expect, it } from "vitest";

import { companies, questions } from "./questions";
import {
  type CompanySeed,
  defaultTimeLimitSec,
  type QuestionSeed,
  SeedDataError,
  validateSeedData,
} from "./schema";

const company: CompanySeed = { slug: "acme", name: "Acme" };
const question: QuestionSeed = {
  slug: "design-a-thing",
  title: "Design a thing",
  prompt: "Design a thing that does something useful at scale.",
  category: "SYSTEM_DESIGN",
  difficulty: "MEDIUM",
  companies: ["acme"],
};

function issuesOf(run: () => unknown): readonly string[] {
  try {
    run();
  } catch (error) {
    if (error instanceof SeedDataError) return error.issues;
    throw error;
  }
  throw new Error("expected SeedDataError");
}

describe("question bank seed data", () => {
  it("is valid", () => {
    expect(() => validateSeedData({ companies, questions })).not.toThrow();
  });

  it("has around fifty questions", () => {
    expect(questions.length).toBeGreaterThanOrEqual(50);
  });

  it.each(["SYSTEM_DESIGN", "BEHAVIORAL", "CODING"] as const)(
    "covers %s at every difficulty",
    (category) => {
      const inCategory = questions.filter((q) => q.category === category);
      expect(inCategory.length).toBeGreaterThanOrEqual(15);
      expect(new Set(inCategory.map((q) => q.difficulty))).toEqual(
        new Set(["EASY", "MEDIUM", "HARD"]),
      );
    },
  );

  it("tags every company on at least one question", () => {
    const used = new Set(questions.flatMap((q) => q.companies));
    expect(companies.filter((c) => !used.has(c.slug))).toEqual([]);
  });
});

describe("validateSeedData", () => {
  it("returns the parsed data when valid", () => {
    expect(validateSeedData({ companies: [company], questions: [question] })).toEqual({
      companies: [company],
      questions: [question],
    });
  });

  it("rejects duplicate question slugs", () => {
    const issues = issuesOf(() =>
      validateSeedData({ companies: [company], questions: [question, { ...question }] }),
    );
    expect(issues).toEqual(['duplicate question slug "design-a-thing"']);
  });

  it("rejects duplicate company slugs and names", () => {
    const issues = issuesOf(() =>
      validateSeedData({ companies: [company, { ...company }], questions: [] }),
    );
    expect(issues).toEqual(['duplicate company slug "acme"', 'duplicate company name "Acme"']);
  });

  it("rejects tags for unknown companies", () => {
    const issues = issuesOf(() =>
      validateSeedData({ companies: [company], questions: [{ ...question, companies: ["nope"] }] }),
    );
    expect(issues).toEqual(['question "design-a-thing" references unknown company "nope"']);
  });

  it("rejects a company tagged twice on one question", () => {
    const issues = issuesOf(() =>
      validateSeedData({
        companies: [company],
        questions: [{ ...question, companies: ["acme", "acme"] }],
      }),
    );
    expect(issues).toEqual(['question "design-a-thing" lists company "acme" twice']);
  });

  it("reports field errors with their path", () => {
    const issues = issuesOf(() =>
      validateSeedData({
        companies: [company],
        questions: [{ ...question, slug: "Not A Slug", timeLimitSec: 5 }],
      }),
    );
    expect(issues).toHaveLength(2);
    expect(issues[0]).toMatch(/^questions\[0\]\.slug: must be lowercase kebab-case/);
    expect(issues[1]).toMatch(/^questions\[0\]\.timeLimitSec:/);
  });

  it("reports every problem at once", () => {
    const issues = issuesOf(() =>
      validateSeedData({
        companies: [{ slug: "BAD", name: "" }],
        questions: [question, question],
      }),
    );
    // Two company field errors, one duplicate slug, and the duplicate's unknown tag twice.
    expect(issues.length).toBeGreaterThanOrEqual(4);
  });
});

describe("defaultTimeLimitSec", () => {
  it("gives system design a full interview slot", () => {
    expect(defaultTimeLimitSec("SYSTEM_DESIGN", "EASY")).toBe(45 * 60);
  });

  it("gives behavioral questions a single-answer time box", () => {
    expect(defaultTimeLimitSec("BEHAVIORAL", "HARD")).toBe(8 * 60);
  });

  it("scales coding with difficulty", () => {
    expect(
      (["EASY", "MEDIUM", "HARD"] as const).map((d) => defaultTimeLimitSec("CODING", d)),
    ).toEqual([20 * 60, 30 * 60, 45 * 60]);
  });
});
