import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/auth";
import { FeedbackForm } from "@/components/feedback/feedback-form";
import { FeedbackPanel } from "@/components/feedback/feedback-panel";
import { MAIN_CONTENT_ID } from "@/components/layout/skip-link";
import { PracticeRunner } from "@/components/practice/practice-runner";
import { QuestionBadges } from "@/components/questions/question-badges";
import { getPrisma } from "@/lib/db";
import { getSessionFeedback } from "@/lib/feedback/service";
import { feedbackStatusMessage, PRACTICE_PATH, practiceHref } from "@/lib/practice/paths";
import { getSession } from "@/lib/practice/service";
import { formatTimeSpent } from "@/lib/practice/timer";
import { formatTimeLimit } from "@/lib/questions/filters";

import { requestFeedbackAction, savePracticeAction, submitPracticeAction } from "../actions";

export const metadata: Metadata = { title: "Practice session" };

type Params = { id: string };
type SearchParams = Record<string, string | string[] | undefined>;

/**
 * One practice session. While in progress it renders the timed runner; once submitted (or
 * expired, which the service finalizes on load) it renders a read-only review with rubric
 * feedback per answer, generated on request.
 */
export default async function PracticeSessionPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams?: Promise<SearchParams>;
}) {
  const { id } = await params;
  const query = (await searchParams) ?? {};
  const user = await requireUser(practiceHref(id));
  const now = new Date();
  const result = await getSession(getPrisma(), user.id, id, { now });
  if (!result.ok) notFound();
  const session = result.value;

  if (session.status === "IN_PROGRESS") {
    return (
      <main
        id={MAIN_CONTENT_ID}
        tabIndex={-1}
        className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-10 focus:outline-none sm:px-6"
      >
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

  const feedback = await getSessionFeedback(getPrisma(), user.id, session.id);
  const pending = session.answers.filter((answer) => !feedback.has(answer.id)).length;
  const status = feedbackStatusMessage(query.feedback);

  return (
    <main
      id={MAIN_CONTENT_ID}
      tabIndex={-1}
      className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-12 focus:outline-none sm:px-6"
    >
      <header className="flex flex-col gap-2">
        <Link
          href={PRACTICE_PATH}
          className="text-accent text-sm underline-offset-4 hover:underline"
        >
          ← Practice
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">Session submitted</h1>
        <p className="text-muted">
          {pending === 0
            ? "Each answer is scored 1-5 on the rubric an interviewer would use for its category."
            : "Review what you wrote, then get rubric-based feedback on each answer."}
        </p>
        {status && (
          <p role="alert" className="rounded-md border border-amber-500/50 px-3 py-2 text-sm">
            {status}
          </p>
        )}
        <div>
          <FeedbackForm
            sessionId={session.id}
            regenerate={pending === 0}
            action={requestFeedbackAction}
          />
        </div>
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
            {feedback.has(answer.id) ? (
              <FeedbackPanel feedback={feedback.get(answer.id)!} />
            ) : (
              <p className="text-muted text-sm">No feedback yet.</p>
            )}
          </li>
        ))}
      </ol>
    </main>
  );
}
