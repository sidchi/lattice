import type { Metadata } from "next";
import Link from "next/link";

import { requireUser } from "@/auth";
import { getPrisma } from "@/lib/db";
import { HISTORY_PATH } from "@/lib/history/paths";
import { MAX_QUESTIONS } from "@/lib/practice/limits";
import { PRACTICE_PATH, practiceHref, startErrorMessage } from "@/lib/practice/paths";
import { listSessions } from "@/lib/practice/service";
import { isPastGrace } from "@/lib/practice/timer";
import { categoryOptions, difficultyOptions } from "@/lib/questions/filters";

import { startPracticeAction } from "./actions";

export const metadata: Metadata = { title: "Practice" };

type SearchParams = Record<string, string | string[] | undefined>;

const selectClass = "border-border bg-background rounded-md border px-3 py-2 text-sm";

const dateFormat = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

export default async function PracticePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser(PRACTICE_PATH);
  const error = startErrorMessage((await searchParams).error);
  const sessions = await listSessions(getPrisma(), user.id);
  const now = new Date();

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-10 px-4 py-12 sm:px-6 sm:py-16">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Practice</h1>
        <p className="text-muted">
          A timed mock interview: answer in writing as if you were talking it through. Progress
          saves automatically, and the session submits itself when time runs out.
        </p>
      </header>

      <section aria-labelledby="start-heading" className="flex flex-col gap-4">
        <h2 id="start-heading" className="text-xl font-semibold">
          Start a session
        </h2>
        {error ? (
          <p role="alert" className="rounded-md border border-rose-600/40 p-3 text-sm">
            {error}
          </p>
        ) : null}
        <form action={startPracticeAction} className="flex flex-wrap items-end gap-4">
          <input type="hidden" name="mode" value="random" />
          <div className="flex min-w-40 flex-1 flex-col gap-1">
            <label htmlFor="start-category" className="text-sm font-medium">
              Category
            </label>
            <select id="start-category" name="category" defaultValue="" className={selectClass}>
              <option value="">Any category</option>
              {categoryOptions.map((option) => (
                <option key={option.slug} value={option.slug}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex min-w-40 flex-1 flex-col gap-1">
            <label htmlFor="start-difficulty" className="text-sm font-medium">
              Difficulty
            </label>
            <select id="start-difficulty" name="difficulty" defaultValue="" className={selectClass}>
              <option value="">Any difficulty</option>
              {difficultyOptions.map((option) => (
                <option key={option.slug} value={option.slug}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex min-w-32 flex-col gap-1">
            <label htmlFor="start-count" className="text-sm font-medium">
              Questions
            </label>
            <select id="start-count" name="count" defaultValue="1" className={selectClass}>
              {Array.from({ length: MAX_QUESTIONS }, (_, i) => i + 1).map((count) => (
                <option key={count} value={count}>
                  {count}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="bg-accent text-background rounded-md px-4 py-2 text-sm font-semibold"
          >
            Start
          </button>
        </form>
        <p className="text-muted text-sm">
          Questions are picked at random. To practice a specific one, open it from the{" "}
          <Link href="/questions" className="text-accent underline underline-offset-4">
            question bank
          </Link>
          .
        </p>
      </section>

      <section aria-labelledby="recent-heading" className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="recent-heading" className="text-xl font-semibold">
            Recent sessions
          </h2>
          <Link
            href={HISTORY_PATH}
            className="text-accent text-sm underline-offset-4 hover:underline"
          >
            History & progress →
          </Link>
        </div>
        {sessions.length === 0 ? (
          <p className="text-muted">No sessions yet.</p>
        ) : (
          <ul className="divide-border border-border divide-y rounded-lg border">
            {sessions.map((session) => {
              // Lazily expired sessions still read IN_PROGRESS until opened; label them honestly.
              const label =
                session.status === "ABANDONED"
                  ? "Abandoned"
                  : session.status === "IN_PROGRESS" && !isPastGrace(session.deadline, now)
                    ? "In progress"
                    : "Submitted";
              return (
                <li
                  key={session.id}
                  className="flex flex-wrap items-center justify-between gap-2 p-4"
                >
                  <div className="flex flex-col gap-1">
                    <Link
                      href={practiceHref(session.id)}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {session.questionTitles.join(" · ")}
                    </Link>
                    <span className="text-muted text-xs">
                      Started {dateFormat.format(session.startedAt)} UTC
                    </span>
                  </div>
                  <span className="border-border rounded-full border px-2 py-0.5 text-xs">
                    {label}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
