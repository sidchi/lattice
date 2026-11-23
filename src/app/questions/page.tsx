import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Pagination } from "@/components/questions/pagination";
import { QuestionBadges } from "@/components/questions/question-badges";
import { QuestionFilterForm } from "@/components/questions/question-filter-form";
import { getPrisma } from "@/lib/db";
import {
  hasActiveFilters,
  PAGE_SIZE,
  parseQuestionFilters,
  questionsHref,
  requestedHref,
} from "@/lib/questions/filters";
import { getQuestionFacets, listQuestions } from "@/lib/questions/repository";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Question bank",
  description: "Browse system design, behavioral and coding interview questions.",
};

type SearchParams = Record<string, string | string[] | undefined>;

export default async function QuestionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const requested = parseQuestionFilters(params);

  const prisma = getPrisma();
  const [result, facets] = await Promise.all([
    listQuestions(prisma, requested),
    getQuestionFacets(prisma, requested),
  ]);

  // One URL per view: drop empty form fields and stray parameters, and clamp pages past
  // the end. redirect() throws, so nothing below runs for a non-canonical URL.
  const filters = { ...requested, page: result.page };
  const canonical = questionsHref(filters);
  if (requestedHref(params) !== canonical) redirect(canonical);

  const first = (result.page - 1) * PAGE_SIZE + 1;

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-12 sm:px-6 sm:py-16">
      <header className="flex flex-col gap-2">
        <Link href="/" className="text-accent text-sm font-semibold tracking-wide uppercase">
          {site.name}
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">Question bank</h1>
        <p className="text-muted">
          System design, behavioral and coding questions, each with a suggested time box.
        </p>
      </header>

      <QuestionFilterForm filters={filters} facets={facets} />

      <section aria-labelledby="results-heading" className="flex flex-col gap-4">
        <h2 id="results-heading" className="sr-only">
          Results
        </h2>
        <p className="text-muted text-sm" role="status">
          {result.total === 0
            ? "No questions match these filters."
            : result.pageCount > 1
              ? `Showing ${first}–${first + result.items.length - 1} of ${result.total} questions`
              : `${result.total} ${result.total === 1 ? "question" : "questions"}`}
        </p>

        {result.items.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {result.items.map((question) => (
              <li key={question.slug}>
                <article className="border-border hover:border-accent/60 relative flex flex-col gap-2 rounded-lg border p-4 transition-colors">
                  <h3 className="font-semibold">
                    <Link
                      href={`/questions/${question.slug}`}
                      className="after:absolute after:inset-0 focus-visible:underline"
                    >
                      {question.title}
                    </Link>
                  </h3>
                  <QuestionBadges {...question} />
                  {question.companies.length > 0 ? (
                    <p className="text-muted text-xs">
                      <span className="sr-only">Companies: </span>
                      {question.companies.map((company) => company.name).join(" · ")}
                    </p>
                  ) : null}
                </article>
              </li>
            ))}
          </ul>
        ) : hasActiveFilters(filters) ? (
          <p>
            <Link href="/questions" className="text-accent underline underline-offset-4">
              Clear all filters
            </Link>
          </p>
        ) : null}

        <Pagination filters={filters} page={result.page} pageCount={result.pageCount} />
      </section>
    </main>
  );
}
