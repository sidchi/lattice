/**
 * Practice limits shared by server validation and the client editor. Kept dependency-free so
 * importing them into a client component does not pull server code into the bundle.
 */

/** Questions per session. A real loop is 1-3 questions; more stops feeling like an interview. */
export const MIN_QUESTIONS = 1;
export const MAX_QUESTIONS = 3;

/**
 * Longest answer accepted, in characters. Generous for a written system-design answer, and a
 * bound on what one autosave can write.
 */
export const MAX_ANSWER_LENGTH = 20_000;
