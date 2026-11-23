import { describe, expect, it } from "vitest";

import { MAX_ANSWER_LENGTH, MAX_QUESTIONS } from "./limits";
import { answerDraftsSchema, parseStartSession, sessionIdSchema } from "./schemas";
import { MAX_SESSION_SEC } from "./timer";

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

describe("parseStartSession", () => {
  it("parses a single-question start", () => {
    expect(
      parseStartSession(form({ mode: "question", question: " Design-Rate-Limiter " })),
    ).toEqual({ mode: "question", question: "design-rate-limiter" });
  });

  it("parses a random start and treats blank selects as 'any'", () => {
    expect(
      parseStartSession(form({ mode: "random", category: "coding", difficulty: "", count: "2" })),
    ).toEqual({ mode: "random", category: "coding", difficulty: undefined, count: 2 });
  });

  it("defaults the count to one", () => {
    expect(parseStartSession(form({ mode: "random" }))).toMatchObject({ count: 1 });
  });

  it.each([
    [{}],
    [{ mode: "nope" }],
    [{ mode: "question" }],
    [{ mode: "question", question: "../etc/passwd" }],
    [{ mode: "random", category: "SYSTEM_DESIGN" }],
    [{ mode: "random", difficulty: "impossible" }],
    [{ mode: "random", count: "0" }],
    [{ mode: "random", count: String(MAX_QUESTIONS + 1) }],
    [{ mode: "random", count: "1.5" }],
  ])("rejects %j", (entries) => {
    expect(parseStartSession(form(entries))).toBeNull();
  });
});

describe("answerDraftsSchema", () => {
  const draft = { answerId: "a1", content: "hello", timeSpentSec: 30 };

  it("accepts well-formed drafts", () => {
    expect(answerDraftsSchema.parse([draft])).toEqual([draft]);
    expect(answerDraftsSchema.parse([])).toEqual([]);
  });

  it("rejects duplicates, oversize content, bad times and too many answers", () => {
    expect(answerDraftsSchema.safeParse([draft, draft]).success).toBe(false);
    expect(
      answerDraftsSchema.safeParse([{ ...draft, content: "x".repeat(MAX_ANSWER_LENGTH + 1) }])
        .success,
    ).toBe(false);
    expect(answerDraftsSchema.safeParse([{ ...draft, timeSpentSec: -1 }]).success).toBe(false);
    expect(answerDraftsSchema.safeParse([{ ...draft, timeSpentSec: 1.5 }]).success).toBe(false);
    expect(
      answerDraftsSchema.safeParse([{ ...draft, timeSpentSec: MAX_SESSION_SEC + 1 }]).success,
    ).toBe(false);
    const many = Array.from({ length: MAX_QUESTIONS + 1 }, (_, i) => ({
      ...draft,
      answerId: `a${i}`,
    }));
    expect(answerDraftsSchema.safeParse(many).success).toBe(false);
    expect(answerDraftsSchema.safeParse("nope").success).toBe(false);
  });
});

describe("sessionIdSchema", () => {
  it("bounds the id", () => {
    expect(sessionIdSchema.safeParse("cm123").success).toBe(true);
    expect(sessionIdSchema.safeParse("").success).toBe(false);
    expect(sessionIdSchema.safeParse("x".repeat(65)).success).toBe(false);
    expect(sessionIdSchema.safeParse(42).success).toBe(false);
  });
});
