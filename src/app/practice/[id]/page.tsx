import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/auth";
import { PracticeRunner } from "@/components/practice/practice-runner";
import { QuestionBadges } from "@/components/questions/question-badges";
import { getPrisma } from "@/lib/db";
import { PRACTICE_PATH, practiceHref } from "@/lib/practice/paths";
import { getSession } from "@/lib/practice/service";
import { formatTimeSpent } from "@/lib/practice/timer";
import { formatTimeLimit } from "@/lib/questions/filters";

import { savePracticeAction, submitPracticeAction } from "../actions";

export const metadata: Metadata = { title: "Practice session" };

type Params = { id: string };

/**
 * One practice session. While in progress it renders the timed runner; once submitted (or
 * expired, which the service finalizes on load) it renders a read-only review.
 */
export default async function PracticeSessionPage({ params }: { params: Promise<Params> }) {
  const { id } = await params;
  const user = await requireUser(practiceHref(id));
  const now = new Date();
  const result = await getSession(getPrisma(), user.id, id, { now });
  if (!result.ok) notFound();
  const session = result.value;

  if (session.status === "IN_PROGRESS") {
    return (
      <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-10 sm:px-6">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight">Mock interview</h1>
          <p className="text-muted text-sm">
            {session.answers.length === 1 ? "One question" : `${session.answers.length} questions`}{" "}
            · {formatTimeLimit(session.timeLimitSec)} total
          </p>
        </header>
        <PracticeRunner
          sessionId={session.id}
          deadline={session.deadline.toISOString()}
          serverNow={now.toISOString()}
          timeLimitSec={session.timeLimitSec}
          answers={session.answers}
          save={savePracticeAction}
          submit={submitPracticeAction}
        />
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-12 sm:px-6">
      <header className="flex flex-col gap-2">
        <Link
          href={PRACTICE_PATH}
          className="text-accent text-sm underline-offset-4 hover:underline"
        >
          ← Practice
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">Session submitted</h1>
        <p className="text-muted">
          Rubric-based feedback on each answer is the next feature on the roadmap. For now, review
          what you wrote and how long each answer took.
        </p>
      </header>

      <ol className="flex flex-col gap-8">
        {session.answers.map((answer, index) => (
          <li key={answer.id} className="flex flex-col gap-3">
            <h2 className="text-xl font-semibold">
              <span className="text-muted">Q{index + 1}.</span>{" "}
              <Link
                href={`/questions/${answer.question.slug}`}
                className="underline-offset-4 hover:underline"
              >
                {answer.question.title}
              </Link>
            </h2>
            <QuestionBadges {...answer.question} />
            <p className="text-muted text-sm">Time spent: {formatTimeSpent(answer.timeSpentSec)}</p>
            {answer.content.trim() ? (
              <pre className="border-border rounded-lg border p-4 font-mono text-sm whitespace-pre-wrap">
                {answer.content}
              </pre>
            ) : (
              <p className="text-muted italic">No answer written.</p>
            )}
          </li>
        ))}
      </ol>
    </main>
  );
}
