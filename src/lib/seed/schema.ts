import { z } from "zod";

import { Difficulty, QuestionCategory } from "@/generated/prisma/enums";

const slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "must be lowercase kebab-case (a-z, 0-9, single dashes)");

export const companySeedSchema = z.object({
  slug,
  name: z.string().trim().min(1),
});

export const questionSeedSchema = z.object({
  slug,
  title: z.string().trim().min(3).max(120),
  prompt: z.string().trim().min(20),
  category: z.nativeEnum(QuestionCategory),
  difficulty: z.nativeEnum(Difficulty),
  /** Overrides {@link defaultTimeLimitSec} when a question needs a different time box. */
  timeLimitSec: z
    .number()
    .int()
    .min(60)
    .max(90 * 60)
    .optional(),
  /** Company slugs; each must exist in the company list. */
  companies: z.array(slug),
});

export type CompanySeed = z.infer<typeof companySeedSchema>;
export type QuestionSeed = z.infer<typeof questionSeedSchema>;

export type SeedData = {
  companies: readonly CompanySeed[];
  questions: readonly QuestionSeed[];
};

export class SeedDataError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(`Invalid seed data:\n  - ${issues.join("\n  - ")}`);
    this.name = "SeedDataError";
  }
}

const MINUTE = 60;

/**
 * Default mock-interview time box. System design gets a full interview slot, behavioral
 * questions a single STAR-style answer, and coding scales with difficulty.
 */
export function defaultTimeLimitSec(category: QuestionCategory, difficulty: Difficulty): number {
  switch (category) {
    case QuestionCategory.SYSTEM_DESIGN:
      return 45 * MINUTE;
    case QuestionCategory.BEHAVIORAL:
      return 8 * MINUTE;
    case QuestionCategory.CODING:
      return { EASY: 20, MEDIUM: 30, HARD: 45 }[difficulty] * MINUTE;
  }
}

function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  return [...new Set(values.filter((value) => seen.has(value) || !seen.add(value)))];
}

/**
 * Validates seed data as a whole: per-record shape plus the cross-record rules the database
 * would otherwise reject halfway through a seed (duplicate slugs, unknown company tags).
 * Every problem is reported at once.
 */
export function validateSeedData(data: SeedData): SeedData {
  const issues: string[] = [];

  const companies = data.companies.flatMap((company, index) => {
    const result = companySeedSchema.safeParse(company);
    if (result.success) return [result.data];
    issues.push(
      ...result.error.issues.map((i) => `companies[${index}].${i.path.join(".")}: ${i.message}`),
    );
    return [];
  });

  const questions = data.questions.flatMap((question, index) => {
    const result = questionSeedSchema.safeParse(question);
    if (result.success) return [result.data];
    issues.push(
      ...result.error.issues.map((i) => `questions[${index}].${i.path.join(".")}: ${i.message}`),
    );
    return [];
  });

  for (const dup of duplicates(companies.map((c) => c.slug)))
    issues.push(`duplicate company slug "${dup}"`);
  for (const dup of duplicates(companies.map((c) => c.name)))
    issues.push(`duplicate company name "${dup}"`);
  for (const dup of duplicates(questions.map((q) => q.slug)))
    issues.push(`duplicate question slug "${dup}"`);

  const known = new Set(companies.map((c) => c.slug));
  for (const question of questions) {
    for (const tag of duplicates(question.companies)) {
      issues.push(`question "${question.slug}" lists company "${tag}" twice`);
    }
    for (const tag of question.companies.filter((t) => !known.has(t))) {
      issues.push(`question "${question.slug}" references unknown company "${tag}"`);
    }
  }

  if (issues.length > 0) throw new SeedDataError(issues);
  return { companies, questions };
}
