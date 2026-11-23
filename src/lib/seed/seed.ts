import type { PrismaClient } from "@/generated/prisma/client";

import { companies, questions } from "./questions";
import { defaultTimeLimitSec, type SeedData, validateSeedData } from "./schema";

export type SeedSummary = {
  companies: number;
  questionsCreated: number;
  questionsUpdated: number;
};

export const defaultSeedData: SeedData = { companies, questions };

/**
 * Loads the question bank. Idempotent: companies and questions are upserted on their slugs,
 * so re-running after editing the seed data updates rows in place, and each question's
 * company tags are replaced with exactly the ones in the data.
 *
 * Questions that are no longer in the data are left alone on purpose: past answers
 * reference them (the FK is RESTRICT), and history should not vanish because a question
 * was retired from the bank.
 *
 * Runs in a single transaction, so a failure leaves the database as it was.
 */
export async function seedQuestionBank(
  prisma: PrismaClient,
  data: SeedData = defaultSeedData,
): Promise<SeedSummary> {
  const valid = validateSeedData(data);

  return prisma.$transaction(async (tx) => {
    const companyIds = new Map<string, string>();
    for (const company of valid.companies) {
      const row = await tx.company.upsert({
        where: { slug: company.slug },
        create: company,
        update: { name: company.name },
        select: { id: true },
      });
      companyIds.set(company.slug, row.id);
    }

    const existing = new Set(
      (
        await tx.question.findMany({
          where: { slug: { in: valid.questions.map((q) => q.slug) } },
          select: { slug: true },
        })
      ).map((q) => q.slug),
    );

    for (const { companies: tags, timeLimitSec, ...question } of valid.questions) {
      const fields = {
        ...question,
        timeLimitSec: timeLimitSec ?? defaultTimeLimitSec(question.category, question.difficulty),
      };
      const { id } = await tx.question.upsert({
        where: { slug: question.slug },
        create: fields,
        update: fields,
        select: { id: true },
      });

      await tx.questionCompany.deleteMany({ where: { questionId: id } });
      if (tags.length > 0) {
        await tx.questionCompany.createMany({
          // validateSeedData guarantees every tag is a known company.
          data: tags.map((tag) => ({ questionId: id, companyId: companyIds.get(tag)! })),
        });
      }
    }

    return {
      companies: valid.companies.length,
      questionsCreated: valid.questions.length - existing.size,
      questionsUpdated: existing.size,
    };
  });
}
