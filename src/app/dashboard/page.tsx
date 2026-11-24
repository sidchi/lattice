import type { Metadata } from "next";
import Link from "next/link";

import { requireUser } from "@/auth";
import { SignOutButton } from "@/components/auth/auth-buttons";
import { getPrisma } from "@/lib/db";
import { MAX_SCORE } from "@/lib/feedback/rubric";
import { HISTORY_PATH } from "@/lib/history/paths";
import { formatScore } from "@/lib/history/progress";
import { getProgressSummary } from "@/lib/history/service";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requireUser("/dashboard");
  const displayName = user.name ?? user.email;
  const progress = await getProgressSummary(getPrisma(), user.id);
  const focus = progress.weakAreas[0];

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-16 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Welcome, {displayName}</h1>
          <p className="text-muted mt-1 text-sm">Signed in as {user.email}</p>
        </div>
        <SignOutButton />
      </header>
      <div className="flex flex-wrap gap-3">
        <Link
          href="/practice"
          className="bg-accent text-background rounded-md px-4 py-2 text-sm font-semibold"
        >
          Start practicing
        </Link>
        <Link
          href="/questions"
          className="border-border rounded-md border px-4 py-2 text-sm font-medium"
        >
          Browse the question bank
        </Link>
      </div>
      {progress.sessionsCompleted > 0 ? (
        <section aria-labelledby="progress-heading" className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="progress-heading" className="text-xl font-semibold">
              Your progress
            </h2>
            <Link
              href={HISTORY_PATH}
              className="text-accent text-sm underline-offset-4 hover:underline"
            >
              History & progress →
            </Link>
          </div>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="border-border rounded-lg border p-4">
              <dt className="text-muted text-xs">Sessions completed</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums">
                {progress.sessionsCompleted}
              </dd>
            </div>
            <div className="border-border rounded-lg border p-4">
              <dt className="text-muted text-xs">Average score</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums">
                {progress.averageScore === null
                  ? "—"
                  : `${formatScore(progress.averageScore)} / ${MAX_SCORE}`}
              </dd>
            </div>
            <div className="border-border rounded-lg border p-4">
              <dt className="text-muted text-xs">Focus area</dt>
              <dd className="mt-1 text-lg font-semibold">{focus ? focus.label : "—"}</dd>
            </div>
          </dl>
        </section>
      ) : null}
    </main>
  );
}
