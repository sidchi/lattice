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
