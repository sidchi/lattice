/** Practice routes. `/practice` is protected by middleware (see src/lib/auth/paths.ts). */
export const PRACTICE_PATH = "/practice";

export function practiceHref(sessionId: string): string {
  return `${PRACTICE_PATH}/${encodeURIComponent(sessionId)}`;
}

/** User-facing messages for errors the start action reports via `?error=`. */
export const startErrorMessages: Record<string, string> = {
  invalid: "That selection wasn't valid. Pick a category, difficulty and number of questions.",
  no_questions: "No questions match that selection. Try widening the filters.",
};

export function startErrorMessage(code: string | string[] | undefined): string | null {
  const key = Array.isArray(code) ? code[0] : code;
  return key && Object.hasOwn(startErrorMessages, key) ? startErrorMessages[key]! : null;
}

/** Messages for the feedback outcome the feedback action reports via `?feedback=`. */
export const feedbackStatusMessages: Record<string, string> = {
  partial:
    "Feedback couldn't be generated for some answers. Try again; answers that already have feedback are kept.",
  failed: "Feedback couldn't be generated. Try again in a moment.",
  not_submitted: "Feedback is available once the session is submitted.",
};

export function feedbackStatusMessage(code: string | string[] | undefined): string | null {
  const key = Array.isArray(code) ? code[0] : code;
  return key && Object.hasOwn(feedbackStatusMessages, key) ? feedbackStatusMessages[key]! : null;
}
