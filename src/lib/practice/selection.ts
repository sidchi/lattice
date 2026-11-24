import { MAX_SESSION_SEC } from "./timer";

/** Anything with a time box can be picked; the service passes `{ id, timeLimitSec }` rows. */
export type Candidate = { id: string; timeLimitSec: number };

/** A function returning a float in [0, 1), like `Math.random`. Injected so tests are exact. */
export type RandomSource = () => number;

/**
 * Picks `count` distinct candidates uniformly at random (a partial Fisher-Yates shuffle), in
 * the order drawn. Returns all of them, shuffled, when there are fewer than `count`. The input
 * array is not modified.
 */
export function sampleQuestions<T extends Candidate>(
  candidates: readonly T[],
  count: number,
  random: RandomSource = Math.random,
): T[] {
  const pool = [...candidates];
  const take = Math.max(0, Math.min(count, pool.length));
  for (let i = 0; i < take; i++) {
    const j = i + Math.floor(random() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, take);
}

/**
 * The time box for a whole session: the sum of its questions' suggested limits, capped at
 * {@link MAX_SESSION_SEC}. Computed once at start and stored on the session, so editing a
 * question later does not change the deadline of a session already in progress.
 */
export function sessionTimeLimit(questions: readonly Candidate[]): number {
  const total = questions.reduce((sum, question) => sum + Math.max(0, question.timeLimitSec), 0);
  return Math.min(total, MAX_SESSION_SEC);
}
