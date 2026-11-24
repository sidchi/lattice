"use server";

import { redirect } from "next/navigation";

import { requireUser } from "@/auth";
import { getPrisma } from "@/lib/db";
import { getEvaluator } from "@/lib/feedback/factory";
import { generateSessionFeedback } from "@/lib/feedback/service";
import { practiceHref, PRACTICE_PATH } from "@/lib/practice/paths";
import {
  answerDraftsSchema,
  parseStartSession,
  sessionIdSchema,
  type AnswerDraft,
} from "@/lib/practice/schemas";
import {
  saveProgress,
  startSession,
  submitSession,
  type PracticeError,
} from "@/lib/practice/service";

/**
 * Server actions for the practice flow. Each one re-authenticates and re-validates its
 * arguments: a server action is a public POST endpoint, so neither the session cookie's
 * presence nor the shape of the arguments can be assumed from the UI that calls it.
 */

export type SaveResult =
  { ok: true; savedAt: string } | { ok: false; error: PracticeError | "invalid_request" };

/** Starts a session from the practice page or a question's "Practice" button. */
export async function startPracticeAction(form: FormData): Promise<void> {
  const user = await requireUser(PRACTICE_PATH);
  const input = parseStartSession(form);
  if (!input) redirect(`${PRACTICE_PATH}?error=invalid`);

  const result = await startSession(getPrisma(), user.id, input);
  if (!result.ok) redirect(`${PRACTICE_PATH}?error=${result.error}`);
  redirect(practiceHref(result.value.id));
}

function parseDrafts(sessionId: unknown, drafts: unknown): [string, AnswerDraft[]] | null {
  const id = sessionIdSchema.safeParse(sessionId);
  const parsed = answerDraftsSchema.safeParse(drafts);
  return id.success && parsed.success ? [id.data, parsed.data] : null;
}

/** Autosave. Returns a result instead of throwing so the client can show save status. */
export async function savePracticeAction(
  sessionId: string,
  drafts: AnswerDraft[],
): Promise<SaveResult> {
  const user = await requireUser(practiceHref(String(sessionId)));
  const args = parseDrafts(sessionId, drafts);
  if (!args) return { ok: false, error: "invalid_request" };

  const result = await saveProgress(getPrisma(), user.id, ...args);
  return result.ok
    ? { ok: true, savedAt: result.value.savedAt.toISOString() }
    : { ok: false, error: result.error };
}

/**
 * Final submit, then a redirect to the same URL, which now renders the read-only review.
 * Failures that leave nothing to do (already submitted, expired) also land on the review.
 */
export async function submitPracticeAction(
  sessionId: string,
  drafts: AnswerDraft[],
): Promise<SaveResult> {
  const user = await requireUser(practiceHref(String(sessionId)));
  const args = parseDrafts(sessionId, drafts);
  if (!args) return { ok: false, error: "invalid_request" };

  const result = await submitSession(getPrisma(), user.id, ...args);
  if (result.ok || result.error === "not_in_progress" || result.error === "expired") {
    redirect(practiceHref(args[0]));
  }
  return { ok: false, error: result.error };
}

/**
 * Generates rubric feedback for a submitted session, then reloads its review. Answers that
 * already have feedback are skipped unless the form asks to regenerate. Failures come back
 * as `?feedback=` codes so the page can say what happened without losing what succeeded.
 */
export async function requestFeedbackAction(form: FormData): Promise<void> {
  const rawId = form.get("sessionId");
  const user = await requireUser(practiceHref(String(rawId ?? "")));
  const id = sessionIdSchema.safeParse(rawId);
  if (!id.success) redirect(PRACTICE_PATH);
  const href = practiceHref(id.data);

  const result = await generateSessionFeedback(getPrisma(), user.id, id.data, getEvaluator(), {
    regenerate: form.get("regenerate") === "true",
  });
  if (!result.ok) {
    redirect(result.error === "not_found" ? PRACTICE_PATH : `${href}?feedback=${result.error}`);
  }

  const failed = result.value.filter((outcome) => outcome.status === "failed").length;
  if (failed === 0) redirect(href);
  redirect(`${href}?feedback=${failed === result.value.length ? "failed" : "partial"}`);
}
