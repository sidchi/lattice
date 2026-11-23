import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";

import { QuestionBadges } from "@/components/questions/question-badges";
import { getPrisma } from "@/lib/db";
import { categoryLabel, formatTimeLimit, questionsHref } from "@/lib/questions/filters";
import { getQuestionBySlug } from "@/lib/questions/repository";

type Params = { slug: string };

/** Deduplicated per request, so metadata and the page share one query. */
const loadQuestion = cache((slug: string) => getQuestionBySlug(getPrisma(), slug));

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const question = await loadQuestion((await params).slug);
  if (!question) return { title: "Question not found" };
  return {
    title: question.title,
    description: `${categoryLabel(question.category)} interview question.`,
  };
}

export default async function QuestionPage({ params }: { params: Promise<Params> }) {
  const question = await loadQuestion((await params).slug);
  if (!question) notFound();

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-12 sm:px-6 sm:py-16">
      <nav aria-label="Breadcrumb">
        <Link href="/questions" className="text-accent text-sm underline-offset-4 hover:underline">
          ← Question bank
        </Link>
      </nav>

      <article className="flex flex-col gap-6">
        <header className="flex flex-col gap-3">
          <h1 className="text-3xl font-bold tracking-tight text-balance">{question.title}</h1>
          <QuestionBadges {...question} />
        </header>

        <section aria-labelledby="prompt-heading" className="flex flex-col gap-2">
          <h2 id="prompt-heading" className="text-muted text-sm font-semibold uppercase">
            Prompt
          </h2>
          <p className="text-lg leading-relaxed whitespace-pre-line">{question.prompt}</p>
        </section>

        {question.companies.length > 0 ? (
          <section aria-labelledby="companies-heading" className="flex flex-col gap-2">
            <h2 id="companies-heading" className="text-muted text-sm font-semibold uppercase">
              Commonly associated with
            </h2>
            <ul className="flex flex-wrap gap-2">
              {question.companies.map((company) => (
                <li key={company.slug}>
                  <Link
                    href={questionsHref({ company: company.slug, page: 1 })}
                    className="border-border rounded-full border px-3 py-1 text-sm hover:border-current"
                  >
                    {company.name}
                  </Link>
                </li>
              ))}
            </ul>
            <p className="text-muted text-xs">
              Tags mark questions that fit a company&apos;s domain; they are not reports of real
              interviews.
            </p>
          </section>
        ) : null}

        <aside className="border-border rounded-lg border p-4 text-sm">
          <p>
            <strong>Suggested time box: {formatTimeLimit(question.timeLimitSec)}.</strong>{" "}
            <span className="text-muted">
              Answer out loud or in writing before you look anything up. Timed practice sessions
              with saved answers are coming next.
            </span>
          </p>
        </aside>
      </article>
    </main>
  );
}
