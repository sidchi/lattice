/**
 * Time-box arithmetic for practice sessions.
 *
 * The server owns the clock: a session's deadline is `startedAt + timeLimitSec`, computed
 * from timestamps the database recorded. The browser only renders a countdown, and it
 * corrects for its own clock being wrong by measuring the offset against the server's `now`
 * at page load. Nothing here touches `Date.now()` directly, so every rule is a pure function
 * that tests can drive with fixed instants.
 */

/**
 * How long after the deadline a save or submit is still accepted. Covers network latency
 * and the final autosave racing the countdown; it is not extra thinking time, since the UI
 * stops editing at zero.
 */
export const GRACE_PERIOD_SEC = 30;

/** Upper bound on a session time box, so a bad seed value cannot create a week-long session. */
export const MAX_SESSION_SEC = 4 * 60 * 60;

export function sessionDeadline(startedAt: Date, timeLimitSec: number): Date {
  return new Date(startedAt.getTime() + timeLimitSec * 1000);
}

/** Whole seconds left before the deadline, never negative. Rounds up, so "0" means done. */
export function remainingSeconds(deadline: Date, now: Date): number {
  return Math.max(0, Math.ceil((deadline.getTime() - now.getTime()) / 1000));
}

/** True once the deadline plus the grace period has passed: the server stops accepting writes. */
export function isPastGrace(
  deadline: Date,
  now: Date,
  graceSec: number = GRACE_PERIOD_SEC,
): boolean {
  return now.getTime() > deadline.getTime() + graceSec * 1000;
}

/**
 * Milliseconds to add to the browser clock to get server time, measured once at page load.
 * A laptop whose clock is five minutes fast would otherwise show five minutes less than the
 * server will actually allow.
 */
export function clockOffsetMs(serverNow: Date, clientNow: Date): number {
  return serverNow.getTime() - clientNow.getTime();
}

/** Formats a countdown as `m:ss`, or `h:mm:ss` from one hour up. */
export function formatCountdown(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const ss = String(s).padStart(2, "0");
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${ss}`;
  return `${m}:${ss}`;
}

/** Urgency level for styling and screen-reader announcements. */
export type CountdownTone = "normal" | "warning" | "critical";

/** Warning in the last 5 minutes (or last 20% of a short session), critical in the last minute. */
export function countdownTone(remainingSec: number, timeLimitSec: number): CountdownTone {
  if (remainingSec <= 60) return "critical";
  if (remainingSec <= Math.min(5 * 60, timeLimitSec * 0.2)) return "warning";
  return "normal";
}

/** Formats time actually spent: "0 s", "45 s", "12 min", "1 h 5 min". */
export function formatTimeSpent(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}
