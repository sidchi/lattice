"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { QuestionBadges } from "@/components/questions/question-badges";
import type { SaveResult } from "@/app/practice/actions";
import { MAX_ANSWER_LENGTH } from "@/lib/practice/limits";
import type { AnswerDraft } from "@/lib/practice/schemas";
import type { PracticeAnswerView } from "@/lib/practice/service";
import {
  clockOffsetMs,
  countdownTone,
  formatCountdown,
  remainingSeconds,
} from "@/lib/practice/timer";

/** Autosave cadence while there are unsaved changes. */
export const AUTOSAVE_INTERVAL_MS = 15_000;

type SaveFn = (sessionId: string, drafts: AnswerDraft[]) => Promise<SaveResult>;

export type PracticeRunnerProps = {
  sessionId: string;
  /** ISO timestamp from the server. */
  deadline: string;
  /** The server's clock when the page rendered, to correct for a wrong client clock. */
  serverNow: string;
  timeLimitSec: number;
  answers: PracticeAnswerView[];
  save: SaveFn;
  submit: SaveFn;
};

type SaveStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: Date }
  | { kind: "error"; message: string };

const errorMessages: Record<string, string> = {
  expired: "Time is up. Your last saved answers were submitted.",
  not_in_progress: "This session has already been submitted.",
  not_found: "This session no longer exists.",
};

function describeError(error: string): string {
  return errorMessages[error] ?? "Couldn't save. Your answers are still here; we'll retry.";
}

const toneClass = {
  normal: "border-border",
  warning: "border-amber-600/60 text-amber-700 dark:text-amber-300",
  critical: "border-rose-600/60 text-rose-700 dark:text-rose-300",
} as const;

/**
 * The timed interview: countdown, one answer editor per question, autosave and submit.
 *
 * The server stays authoritative. The countdown is derived from the server's deadline (with
 * the client clock offset removed), autosave runs every {@link AUTOSAVE_INTERVAL_MS} while
 * there are unsaved changes and whenever the user switches question, and at zero the runner
 * submits whatever is in the editors. If the tab was closed or asleep, the server finalizes
 * the session with the last autosave on its own.
 */
export function PracticeRunner({
  sessionId,
  deadline,
  serverNow,
  timeLimitSec,
  answers,
  save,
  submit,
}: PracticeRunnerProps) {
  const deadlineDate = useRef(new Date(deadline)).current;
  const offset = useRef(clockOffsetMs(new Date(serverNow), new Date())).current;
  const serverClock = useCallback(() => new Date(Date.now() + offset), [offset]);

  const [active, setActive] = useState(0);
  const [contents, setContents] = useState<Record<string, string>>(() =>
    Object.fromEntries(answers.map((answer) => [answer.id, answer.content])),
  );
  const [remaining, setRemaining] = useState(() => remainingSeconds(deadlineDate, serverClock()));
  const [status, setStatus] = useState<SaveStatus>({ kind: "idle" });
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Refs mirror state for the interval callbacks, which must not be recreated every second.
  const contentsRef = useRef(contents);
  const spentRef = useRef<Record<string, number>>(
    Object.fromEntries(answers.map((answer) => [answer.id, answer.timeSpentSec])),
  );
  const activeRef = useRef(active);
  const lastAccrualRef = useRef(Date.now());
  const dirtyRef = useRef(false);
  const inFlightRef = useRef(false);
  const finishedRef = useRef(false);

  // Focus follows the submit confirmation: "Yes, submit" when it opens, back to "Submit" when
  // it is dismissed. Only after a user toggle, so loading the page never steals focus.
  const submitButtonRef = useRef<HTMLButtonElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const moveFocusRef = useRef(false);

  /**
   * Credits the wall-clock time since the last call to the question on screen. Measured, not
   * counted in ticks: background tabs throttle timers to once a minute or less.
   */
  const accrue = useCallback(() => {
    const now = Date.now();
    const elapsed = (now - lastAccrualRef.current) / 1000;
    lastAccrualRef.current = now;
    const current = answers[activeRef.current];
    if (current && !finishedRef.current) {
      spentRef.current[current.id] = Math.min(
        timeLimitSec,
        (spentRef.current[current.id] ?? 0) + elapsed,
      );
    }
  }, [answers, timeLimitSec]);

  const drafts = useCallback((): AnswerDraft[] => {
    accrue();
    return answers.map((answer) => ({
      answerId: answer.id,
      content: contentsRef.current[answer.id] ?? "",
      timeSpentSec: Math.floor(spentRef.current[answer.id] ?? 0),
    }));
  }, [accrue, answers]);

  const flush = useCallback(async () => {
    if (finishedRef.current || inFlightRef.current || !dirtyRef.current) return;
    inFlightRef.current = true;
    dirtyRef.current = false;
    setStatus({ kind: "saving" });
    try {
      const result = await save(sessionId, drafts());
      if (result.ok) {
        setStatus({ kind: "saved", at: new Date(result.savedAt) });
      } else {
        // Keep the edits marked unsaved so the next tick retries (unless the session is over).
        dirtyRef.current = true;
        if (result.error === "expired" || result.error === "not_in_progress") {
          finishedRef.current = true;
        }
        setStatus({ kind: "error", message: describeError(result.error) });
      }
    } catch {
      dirtyRef.current = true;
      setStatus({ kind: "error", message: describeError("network") });
    } finally {
      inFlightRef.current = false;
    }
  }, [save, sessionId, drafts]);

  const finish = useCallback(async () => {
    if (finishedRef.current) return;
    accrue();
    finishedRef.current = true;
    setSubmitting(true);
    try {
      // On success the action redirects to the review page, so a result means failure.
      const result = await submit(sessionId, drafts());
      if (result && !result.ok) {
        setSubmitting(false);
        setStatus({ kind: "error", message: describeError(result.error) });
      }
    } catch (error) {
      // Next.js implements redirect() by throwing; let it propagate to the router.
      if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) throw error;
      finishedRef.current = false;
      setSubmitting(false);
      setStatus({ kind: "error", message: "Couldn't submit. Check your connection and retry." });
    }
  }, [accrue, submit, sessionId, drafts]);

  // One-second tick: countdown, time-on-question, and auto-submit at zero.
  useEffect(() => {
    const id = setInterval(() => {
      if (finishedRef.current) return;
      accrue();
      const left = remainingSeconds(deadlineDate, serverClock());
      setRemaining(left);
      if (left === 0) void finish();
    }, 1000);
    return () => clearInterval(id);
  }, [accrue, deadlineDate, finish, serverClock]);

  useEffect(() => {
    const id = setInterval(() => void flush(), AUTOSAVE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [flush]);

  // Warn before closing the tab with unsaved edits.
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current && !finishedRef.current) event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  useEffect(() => {
    if (!moveFocusRef.current) return;
    moveFocusRef.current = false;
    (confirming ? confirmButtonRef : submitButtonRef).current?.focus();
  }, [confirming]);

  const toggleConfirm = (open: boolean) => {
    moveFocusRef.current = true;
    setConfirming(open);
  };

  const select = (index: number) => {
    if (index === active) return;
    accrue(); // Credit the time so far to the question being left.
    activeRef.current = index;
    setActive(index);
    void flush();
  };

  const edit = (answerId: string, value: string) => {
    const next = { ...contentsRef.current, [answerId]: value };
    contentsRef.current = next;
    dirtyRef.current = true;
    setContents(next);
  };

  const tone = countdownTone(remaining, timeLimitSec);
  const current = answers[active]!;
  const content = contents[current.id] ?? "";
  const locked = submitting || remaining === 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div
          role="timer"
          aria-label="Time remaining"
          className={`rounded-lg border px-4 py-2 font-mono text-2xl tabular-nums ${toneClass[tone]}`}
        >
          {formatCountdown(remaining)}
        </div>
        <p aria-live="polite" className="sr-only">
          {tone === "critical"
            ? "Less than one minute left."
            : tone === "warning"
              ? "Less than five minutes left."
              : ""}
        </p>
        <p role="status" className="text-muted text-sm">
          {status.kind === "saving" && "Saving…"}
          {status.kind === "saved" &&
            `Saved at ${status.at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
          {status.kind === "error" && status.message}
        </p>
      </div>

      {answers.length > 1 ? (
        <nav aria-label="Questions" className="flex flex-wrap gap-2">
          {answers.map((answer, index) => (
            <button
              key={answer.id}
              type="button"
              onClick={() => select(index)}
              aria-current={index === active ? "step" : undefined}
              className={`rounded-md border px-3 py-1.5 text-sm ${
                index === active ? "border-accent text-accent font-semibold" : "border-border"
              }`}
            >
              Question {index + 1}
              {contents[answer.id]?.trim() ? <span className="sr-only"> (answered)</span> : null}
            </button>
          ))}
        </nav>
      ) : null}

      <section aria-labelledby="question-title" className="flex flex-col gap-3">
        <h2 id="question-title" className="text-xl font-semibold">
          {current.question.title}
        </h2>
        <QuestionBadges {...current.question} />
        <p className="leading-relaxed whitespace-pre-line">{current.question.prompt}</p>
      </section>

      <div className="flex flex-col gap-2">
        <label htmlFor={`answer-${current.id}`} className="text-sm font-semibold">
          Your answer
        </label>
        <textarea
          id={`answer-${current.id}`}
          value={content}
          onChange={(event) => edit(current.id, event.target.value)}
          maxLength={MAX_ANSWER_LENGTH}
          readOnly={locked}
          rows={16}
          className="border-border bg-background rounded-lg border p-3 font-mono text-sm leading-relaxed"
          placeholder="Think out loud: clarify requirements, outline your approach, then go deep."
        />
        <p className="text-muted text-right text-xs">
          {content.length.toLocaleString()} / {MAX_ANSWER_LENGTH.toLocaleString()} characters
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            dirtyRef.current = true;
            void flush();
          }}
          disabled={locked}
          className="border-border rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-60"
        >
          Save now
        </button>
        {confirming ? (
          <div
            role="group"
            aria-labelledby="confirm-submit-text"
            className="flex flex-wrap items-center gap-3"
            onKeyDown={(event) => {
              if (event.key === "Escape" && !submitting) toggleConfirm(false);
            }}
          >
            <span id="confirm-submit-text" className="text-sm">
              Submit all answers? You can&apos;t edit them afterwards.
            </span>
            <button
              ref={confirmButtonRef}
              type="button"
              onClick={() => void finish()}
              disabled={submitting}
              aria-describedby="confirm-submit-text"
              className="bg-accent text-background rounded-md px-4 py-2 text-sm font-semibold disabled:opacity-60"
            >
              {submitting ? "Submitting…" : "Yes, submit"}
            </button>
            <button
              type="button"
              onClick={() => toggleConfirm(false)}
              disabled={submitting}
              className="text-sm underline underline-offset-4"
            >
              Keep working
            </button>
          </div>
        ) : (
          <button
            ref={submitButtonRef}
            type="button"
            onClick={() => toggleConfirm(true)}
            disabled={locked}
            className="bg-accent text-background rounded-md px-4 py-2 text-sm font-semibold disabled:opacity-60"
          >
            Submit
          </button>
        )}
      </div>
    </div>
  );
}
