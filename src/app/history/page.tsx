import type { Metadata } from "next";
import Link from "next/link";

import { requireUser } from "@/auth";
import { evaluatorLabel } from "@/components/feedback/feedback-panel";
import { ScoreTrendChart } from "@/components/history/score-trend-chart";
import { getPrisma } from "@/lib/db";
import { HEURISTIC_EVALUATOR_ID } from "@/lib/feedback/heuristic";
import { MAX_SCORE } from "@/lib/feedback/rubric";
import { CHART_MAX_POINTS } from "@/lib/history/chart";
import { HISTORY_PATH, historyHref, parseHistoryParams } from "@/lib/history/paths";
import {
  formatDelta,
  formatScore,
  type RecentTrend,
  WEAK_AREA_MAX_SCORE,
  WEAK_AREA_MIN_SAMPLES,
  type WeakArea,
} from "@/lib/history/progress";
import { getProgressSummary, listSessionHistory } from "@/lib/history/service";
import { PRACTICE_PATH, practiceHref } from "@/lib/practice/paths";
import { formatTimeSpent } from "@/lib/practice/timer";
import { categoryLabel, questionsHref } from "@/lib/questions/filters";

export const metadata: Metadata = { title: "History & progress" };

type SearchParams = Record<string, string | string[] | undefined>;

const dateFormat = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

const buttonClass = "bg-accent text-background rounded-md px-4 py-2 text-sm font-semibold";
const linkClass =
  "border-border rounded-md border px-3 py-1.5 text-sm hover:border-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current";

/** A 1-5 average as a thin horizontal bar. Decorative: the number is always printed next to it. */
function AverageBar({ score }: { score: number }) {
  return (
    <span className="bg-border/60 block h-1.5 w-full overflow-hidden rounded-full" aria-hidden>
      <span
        className="bg-accent block h-full rounded-full"
        style={{ width: `${(score / MAX_SCORE) * 100}%` }}
      />
    </span>
  );
}

function trendSentence(trend: RecentTrend): string {
  const sessions = trend.window === 1 ? "session" : `${trend.window} sessions`;
  const comparison = `your last ${sessions} averaged ${formatScore(trend.recentAverage)}, against ${formatScore(trend.previousAverage)} for the ${sessions} before`;
  const rounded = Math.round(trend.delta * 10) / 10;
  if (rounded > 0) return `Improving (${formatDelta(trend.delta)}): ${comparison}.`;
  if (rounded < 0) return `Slipping (${formatDelta(trend.delta)}): ${comparison}.`;
  return `Holding steady: ${comparison}.`;
}

function practiceLink(area: WeakArea) {
  if (area.categories.length !== 1) return null;
  const category = area.categories[0]!;
  return (
    <Link
      href={questionsHref({ category, page: 1 })}
      className="text-accent text-sm underline-offset-4 hover:underline"
    >
      Practice {categoryLabel(category).toLowerCase()} questions
    </Link>
  );
}

/**
 * Past sessions and progress: headline numbers, average score per session over time, the
 * rubric dimensions that most need work, and the full session list.
 */
export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser(HISTORY_PATH);
  const query = await searchParams;
  const prisma = getPrisma();
  const now = new Date();

  // The evaluator filter is validated against the user's own evaluators, so the unfiltered
  // summary is read first to learn them (cheap: it is the same handful of queries).
  const unfiltered = await getProgressSummary(prisma, user.id, { now });
  const { page, evaluator } = parseHistoryParams(query, unfiltered.evaluators);
  const [summary, history] = await Promise.all([
    evaluator ? getProgressSummary(prisma, user.id, { now, evaluator }) : unfiltered,
    listSessionHistory(prisma, user.id, { page, now }),
  ]);

  const header = (
    <header className="flex flex-col gap-2">
      <Link href="/dashboard" className="text-accent text-sm underline-offset-4 hover:underline">
        ← Dashboard
      </Link>
      <h1 className="text-3xl font-bold tracking-tight">History & progress</h1>
    </header>
  );

  if (summary.sessionsCompleted === 0) {
    return (
      <main className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-12 sm:px-6 sm:py-16">
        {header}
        <section className="border-border flex flex-col items-start gap-4 rounded-lg border p-6">
          <p className="text-muted">
            No submitted sessions yet. Finish a mock interview and ask for feedback, and your scores
            over time and weakest rubric areas show up here.
          </p>
          <Link href={PRACTICE_PATH} className={buttonClass}>
            Start practicing
          </Link>
        </section>
      </main>
    );
  }

  const chartPoints = summary.trend.slice(-CHART_MAX_POINTS);
  const mixedEvaluators = !evaluator && summary.evaluators.length > 1;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-10 px-4 py-12 sm:px-6 sm:py-16">
      {header}

      <section aria-labelledby="summary-heading" className="flex flex-col gap-4">
        <h2 id="summary-heading" className="sr-only">
          Summary
        </h2>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Sessions completed", value: String(summary.sessionsCompleted) },
            {
              label: "Average score",
              value:
                summary.averageScore === null
                  ? "—"
                  : `${formatScore(summary.averageScore)} / ${MAX_SCORE}`,
            },
            { label: "Answers scored", value: String(summary.answersScored) },
            { label: "Time practiced", value: formatTimeSpent(summary.timePracticedSec) },
          ].map((stat) => (
            <div key={stat.label} className="border-border rounded-lg border p-4">
              <dt className="text-muted text-xs">{stat.label}</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums">{stat.value}</dd>
            </div>
          ))}
        </dl>

        {summary.evaluators.length > 1 ? (
          <form
            action={HISTORY_PATH}
            method="get"
            className="flex flex-wrap items-end gap-3 text-sm"
          >
            <div className="flex flex-col gap-1">
              <label htmlFor="scored-by" className="font-medium">
                Scored by
              </label>
              <select
                id="scored-by"
                name="scoredBy"
                defaultValue={evaluator ?? ""}
                className="border-border bg-background rounded-md border px-3 py-2"
              >
                <option value="">All evaluators</option>
                {summary.evaluators.map((id) => (
                  <option key={id} value={id}>
                    {evaluatorLabel(id)}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className={linkClass}>
              Apply
            </button>
            {mixedEvaluators ? (
              <p className="text-muted basis-full text-xs">
                Your scores come from more than one evaluator, which grade on different curves. Pick
                one to compare like with like.
              </p>
            ) : null}
          </form>
        ) : null}
        {summary.evaluators.length === 1 && summary.evaluators[0] === HEURISTIC_EVALUATOR_ID ? (
          <p className="text-muted text-xs">
            Scores come from the offline heuristic (keyword coverage, not comprehension). Configure
            an LLM provider for a real review.
          </p>
        ) : null}
      </section>

      <section aria-labelledby="trend-heading" className="flex flex-col gap-3">
        <h2 id="trend-heading" className="text-xl font-semibold">
          Scores over time
        </h2>
        {chartPoints.length === 0 ? (
          <p className="text-muted">
            No scored sessions yet. Open a submitted session and choose &ldquo;Get feedback&rdquo;.
          </p>
        ) : (
          <>
            {summary.recentTrend ? <p>{trendSentence(summary.recentTrend)}</p> : null}
            <ScoreTrendChart points={chartPoints} />
            {summary.trend.length > chartPoints.length ? (
              <p className="text-muted text-xs">
                Showing your latest {CHART_MAX_POINTS} scored sessions.
              </p>
            ) : null}
          </>
        )}
      </section>

      <section aria-labelledby="focus-heading" className="flex flex-col gap-3">
        <h2 id="focus-heading" className="text-xl font-semibold">
          Focus areas
        </h2>
        {summary.weakAreas.length === 0 ? (
          <p className="text-muted">
            {summary.answersScored === 0
              ? "Get feedback on a few answers to see which rubric areas need the most work."
              : `Nothing stands out yet: no rubric area with at least ${WEAK_AREA_MIN_SAMPLES} scores averages below ${WEAK_AREA_MAX_SCORE}.`}
          </p>
        ) : (
          <ol className="flex flex-col gap-3">
            {summary.weakAreas.map((area) => (
              <li
                key={area.dimension}
                className="border-border flex flex-col gap-2 rounded-lg border p-4"
              >
                <div className="flex items-baseline justify-between gap-4">
                  <h3 className="font-semibold">{area.label}</h3>
                  <span className="text-sm tabular-nums">
                    {formatScore(area.averageScore)} / {MAX_SCORE}
                    <span className="text-muted"> · {area.samples} scores</span>
                  </span>
                </div>
                <AverageBar score={area.averageScore} />
                {area.criteria ? <p className="text-muted text-sm">{area.criteria}</p> : null}
                {practiceLink(area)}
              </li>
            ))}
          </ol>
        )}
      </section>

      {summary.categories.length > 0 ? (
        <section aria-labelledby="category-heading" className="flex flex-col gap-3">
          <h2 id="category-heading" className="text-xl font-semibold">
            By category
          </h2>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-muted">
                <th scope="col" className="py-2 font-medium">
                  Category
                </th>
                <th scope="col" className="py-2 font-medium">
                  Average
                </th>
                <th scope="col" className="w-1/3 py-2 font-medium">
                  <span className="sr-only">Bar</span>
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  Answers
                </th>
              </tr>
            </thead>
            <tbody>
              {summary.categories.map((row) => (
                <tr key={row.category} className="border-border border-t">
                  <th scope="row" className="py-2 font-medium">
                    {categoryLabel(row.category)}
                  </th>
                  <td className="py-2 tabular-nums">{formatScore(row.averageScore)}</td>
                  <td className="py-2">
                    <AverageBar score={row.averageScore} />
                  </td>
                  <td className="py-2 text-right tabular-nums">{row.scoredAnswers}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      <section aria-labelledby="sessions-heading" className="flex flex-col gap-4">
        <h2 id="sessions-heading" className="text-xl font-semibold">
          Past sessions
        </h2>
        <ul className="divide-border border-border divide-y rounded-lg border">
          {history.items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="flex min-w-0 flex-col gap-1">
                <Link
                  href={practiceHref(item.id)}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {item.questions.map((question) => question.title).join(" · ")}
                </Link>
                <span className="text-muted text-xs">
                  {dateFormat.format(item.submittedAt)} UTC · {formatTimeSpent(item.timeSpentSec)}
                </span>
              </div>
              <span className="text-sm tabular-nums">
                {item.averageScore === null ? (
                  <span className="text-muted">No feedback yet</span>
                ) : (
                  <>
                    {formatScore(item.averageScore)} / {MAX_SCORE}
                    {item.scoredAnswers < item.answerCount ? (
                      <span className="text-muted">
                        {" "}
                        ({item.scoredAnswers} of {item.answerCount} scored)
                      </span>
                    ) : null}
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
        {history.pageCount > 1 ? (
          <nav aria-label="Pagination" className="flex items-center justify-between gap-4">
            {history.page > 1 ? (
              <Link
                href={historyHref({ page: history.page - 1, evaluator })}
                rel="prev"
                className={linkClass}
              >
                ← Newer
              </Link>
            ) : (
              <span />
            )}
            <p className="text-muted text-sm" aria-current="page">
              Page {history.page} of {history.pageCount}
            </p>
            {history.page < history.pageCount ? (
              <Link
                href={historyHref({ page: history.page + 1, evaluator })}
                rel="next"
                className={linkClass}
              >
                Older →
              </Link>
            ) : (
              <span />
            )}
          </nav>
        ) : null}
      </section>
    </main>
  );
}
