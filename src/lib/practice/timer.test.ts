import { describe, expect, it } from "vitest";

import {
  clockOffsetMs,
  countdownTone,
  formatCountdown,
  formatTimeSpent,
  GRACE_PERIOD_SEC,
  isPastGrace,
  remainingSeconds,
  sessionDeadline,
} from "./timer";

const start = new Date("2026-11-23T10:00:00.000Z");
const at = (offsetSec: number) => new Date(start.getTime() + offsetSec * 1000);

describe("sessionDeadline", () => {
  it("adds the time limit to the start", () => {
    expect(sessionDeadline(start, 45 * 60)).toEqual(new Date("2026-11-23T10:45:00.000Z"));
  });
});

describe("remainingSeconds", () => {
  const deadline = at(600);

  it("counts whole seconds down to zero", () => {
    expect(remainingSeconds(deadline, at(0))).toBe(600);
    expect(remainingSeconds(deadline, at(599))).toBe(1);
    expect(remainingSeconds(deadline, at(600))).toBe(0);
  });

  it("rounds partial seconds up, so 0 only shows once time is really up", () => {
    expect(remainingSeconds(deadline, new Date(deadline.getTime() - 1))).toBe(1);
  });

  it("never goes negative", () => {
    expect(remainingSeconds(deadline, at(10_000))).toBe(0);
  });
});

describe("isPastGrace", () => {
  const deadline = at(600);

  it("accepts writes through the end of the grace period", () => {
    expect(isPastGrace(deadline, at(600))).toBe(false);
    expect(isPastGrace(deadline, at(600 + GRACE_PERIOD_SEC))).toBe(false);
  });

  it("rejects writes after it", () => {
    expect(isPastGrace(deadline, new Date(at(600 + GRACE_PERIOD_SEC).getTime() + 1))).toBe(true);
  });

  it("supports a custom grace period", () => {
    expect(isPastGrace(deadline, at(601), 0)).toBe(true);
  });
});

describe("clockOffsetMs", () => {
  it("is positive when the client clock is behind the server", () => {
    expect(clockOffsetMs(at(300), at(0))).toBe(300_000);
    expect(clockOffsetMs(at(0), at(300))).toBe(-300_000);
  });
});

describe("formatCountdown", () => {
  it.each([
    [0, "0:00"],
    [9, "0:09"],
    [61, "1:01"],
    [45 * 60, "45:00"],
    [3600, "1:00:00"],
    [3600 + 5 * 60 + 7, "1:05:07"],
    [-5, "0:00"],
    [12.9, "0:12"],
  ])("formats %s seconds as %s", (seconds, expected) => {
    expect(formatCountdown(seconds)).toBe(expected);
  });
});

describe("countdownTone", () => {
  it("is critical in the last minute", () => {
    expect(countdownTone(60, 45 * 60)).toBe("critical");
    expect(countdownTone(0, 45 * 60)).toBe("critical");
  });

  it("warns in the last five minutes of a long session", () => {
    expect(countdownTone(5 * 60, 45 * 60)).toBe("warning");
    expect(countdownTone(5 * 60 + 1, 45 * 60)).toBe("normal");
  });

  it("warns in the last 20% of a short session", () => {
    expect(countdownTone(2 * 60, 10 * 60)).toBe("warning");
    expect(countdownTone(2 * 60 + 1, 10 * 60)).toBe("normal");
  });
});

describe("formatTimeSpent", () => {
  it.each([
    [0, "0 s"],
    [45.7, "45 s"],
    [60, "1 min"],
    [12 * 60 + 59, "12 min"],
    [3600, "1 h"],
    [3600 + 5 * 60, "1 h 5 min"],
    [-1, "0 s"],
  ])("formats %s seconds as %s", (seconds, expected) => {
    expect(formatTimeSpent(seconds)).toBe(expected);
  });
});
