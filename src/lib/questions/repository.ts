import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { Difficulty, QuestionCategory } from "@/generated/prisma/enums";

import { categoryOptions, difficultyOptions, PAGE_SIZE, type QuestionFilters } from "./filters";

/**
 * Read model for the question bank. Takes the Prisma client as an argument (rather than
 * importing the app singleton) so tests run it against a throwaway SQLite database.
 */

export type CompanyTag = { slug: string; name: string };

export type QuestionSummary = {
  slug: string;
  title: string;
  category: QuestionCategory;
  difficulty: Difficulty;
  timeLimitSec: number;
  companies: CompanyTag[];
};

export type QuestionDetail = QuestionSummary & { prompt: string };

export type QuestionPage = {
  items: QuestionSummary[];
  total: number;
  /** The page actually returned: requests past the end are clamped to the last page. */
  page: number;
  pageCount: number;
};

export type FacetCount<T> = { value: T; count: number };

export type QuestionFacets = {
  categories: FacetCount<QuestionCategory>[];
  difficulties: FacetCount<Difficulty>[];
  companies: (CompanyTag & { count: number })[];
};

const summarySelect = {
  slug: true,
  title: true,
  category: true,
  difficulty: true,
  timeLimitSec: true,
  companies: {
    select: { company: { select: { slug: true, name: true } } },
    orderBy: { company: { name: "asc" } },
  },
} satisfies Prisma.QuestionSelect;

type SummaryRow = Prisma.QuestionGetPayload<{ select: typeof summarySelect }>;

function toSummary({ companies, ...question }: SummaryRow): QuestionSummary {
  return { ...question, companies: companies.map(({ company }) => company) };
}

type FilterKey = "category" | "difficulty" | "company";

/** Prisma `where` for the filters, optionally ignoring one of them (for facet counts). */
function questionWhere(filters: QuestionFilters, ignore?: FilterKey): Prisma.QuestionWhereInput {
  return {
    ...(filters.category && ignore !== "category" && { category: filters.category }),
    ...(filters.difficulty && ignore !== "difficulty" && { difficulty: filters.difficulty }),
    ...(filters.company &&
      ignore !== "company" && { companies: { some: { company: { slug: filters.company } } } }),
  };
}

/**
 * One page of questions matching the filters, ordered by title (then slug, so ties never
 * reorder between pages). Enums are TEXT on SQLite, so ordering by difficulty would be
 * alphabetical rather than easy-to-hard; title order is predictable on both databases.
 */
export async function listQuestions(
  prisma: PrismaClient,
  filters: QuestionFilters,
  pageSize: number = PAGE_SIZE,
): Promise<QuestionPage> {
  const where = questionWhere(filters);
  const total = await prisma.question.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, filters.page), pageCount);

  const rows = await prisma.question.findMany({
    where,
    select: summarySelect,
    orderBy: [{ title: "asc" }, { slug: "asc" }],
    skip: (page - 1) * pageSize,
    take: pageSize,
  });

  return { items: rows.map(toSummary), total, page, pageCount };
}

/**
 * Counts for each filter option, the way faceted search usually works: each facet applies
 * every *other* active filter but not its own. With `category=coding` selected, the category
 * facet still shows how many system-design questions exist (so switching is informed),
 * while the difficulty facet only counts coding questions.
 *
 * Every option is returned, including zero counts, so the UI can show them disabled rather
 * than having options appear and disappear.
 */
export async function getQuestionFacets(
  prisma: PrismaClient,
  filters: QuestionFilters,
): Promise<QuestionFacets> {
  const [categoryRows, difficultyRows, companyRows] = await Promise.all([
    prisma.question.groupBy({
      by: ["category"],
      where: questionWhere(filters, "category"),
      _count: { _all: true },
    }),
    prisma.question.groupBy({
      by: ["difficulty"],
      where: questionWhere(filters, "difficulty"),
      _count: { _all: true },
    }),
    prisma.company.findMany({
      select: {
        slug: true,
        name: true,
        _count: {
          select: { questions: { where: { question: questionWhere(filters, "company") } } },
        },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  const categoryCounts = new Map(categoryRows.map((row) => [row.category, row._count._all]));
  const difficultyCounts = new Map(difficultyRows.map((row) => [row.difficulty, row._count._all]));

  return {
    categories: categoryOptions.map(({ value }) => ({
      value,
      count: categoryCounts.get(value) ?? 0,
    })),
    difficulties: difficultyOptions.map(({ value }) => ({
      value,
      count: difficultyCounts.get(value) ?? 0,
    })),
    companies: companyRows.map(({ slug, name, _count }) => ({
      slug,
      name,
      count: _count.questions,
    })),
  };
}

/** A single question with its full prompt, or `null` if the slug is unknown. */
export async function getQuestionBySlug(
  prisma: PrismaClient,
  slug: string,
): Promise<QuestionDetail | null> {
  const row = await prisma.question.findUnique({
    where: { slug },
    select: { ...summarySelect, prompt: true },
  });
  if (!row) return null;
  const { prompt, ...summary } = row;
  return { ...toSummary(summary), prompt };
}
