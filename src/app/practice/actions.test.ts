// @vitest-environment node
import { redirect } from "next/navigation";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { requireUser } from "@/auth";
import { getPrisma } from "@/lib/db";
import { seedQuestionBank } from "@/lib/seed/seed";
import { createTestDatabase, type TestDatabase } from "@/test/db";

import { savePracticeAction, startPracticeAction, submitPracticeAction } from "./actions";

vi.mock("@/auth", () => ({ requireUser: vi.fn() }));
vi.mock(import("@/lib/db"), async (importOriginal) => ({
  ...(await importOriginal()),
  getPrisma: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

let db: TestDatabase;
let userId: string;

beforeAll(async () => {
  db = createTestDatabase();
  await seedQuestionBank(db.prisma);
  userId = (await db.prisma.user.create({ data: { email: "ada@example.com" } })).id;
});

afterAll(async () => {
  await db.dispose();
});

beforeEach(() => {
  vi.mocked(getPrisma).mockReturnValue(db.prisma);
  vi.mocked(requireUser).mockResolvedValue({
    id: userId,
    email: "ada@example.com",
    name: "Ada",
    image: null,
  });
});

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

/** Runs the start action and returns the session id it redirected to. */
async function start(entries: Record<string, string>): Promise<string> {
  await expect(startPracticeAction(form(entries))).rejects.toThrow(/NEXT_REDIRECT:\/practice\//);
  const url = vi.mocked(redirect).mock.lastCall![0];
  return url.split("/").pop()!;
}

describe("startPracticeAction", () => {
  it("requires a user", async () => {
    vi.mocked(requireUser).mockRejectedValue(new Error("NEXT_REDIRECT:/signin"));
    await expect(startPracticeAction(form({ mode: "random" }))).rejects.toThrow(
      "NEXT_REDIRECT:/signin",
    );
    expect(requireUser).toHaveBeenCalledWith("/practice");
  });

  it("starts a session for one question and redirects to it", async () => {
    const id = await start({ mode: "question", question: "design-payment-idempotency" });
    const session = await db.prisma.practiceSession.findUniqueOrThrow({
      where: { id },
      include: { answers: { include: { question: true } } },
    });
    expect(session.userId).toBe(userId);
    expect(session.answers.map((a) => a.question.slug)).toEqual(["design-payment-idempotency"]);
  });

  it("starts a random session with the requested number of questions", async () => {
    const id = await start({ mode: "random", category: "behavioral", difficulty: "", count: "3" });
    const answers = await db.prisma.answer.findMany({
      where: { sessionId: id },
      include: { question: true },
    });
    expect(answers).toHaveLength(3);
    expect(answers.every((a) => a.question.category === "BEHAVIORAL")).toBe(true);
  });

  it("redirects back with an error for invalid input or no match", async () => {
    await expect(startPracticeAction(form({ mode: "random", count: "9" }))).rejects.toThrow(
      "NEXT_REDIRECT:/practice?error=invalid",
    );
    await expect(
      startPracticeAction(form({ mode: "question", question: "no-such-question" })),
    ).rejects.toThrow("NEXT_REDIRECT:/practice?error=no_questions");
  });
});

describe("savePracticeAction / submitPracticeAction", () => {
  it("autosaves, then submits and redirects to the review", async () => {
    const id = await start({ mode: "question", question: "design-rate-limiter" });
    const { id: answerId } = await db.prisma.answer.findFirstOrThrow({ where: { sessionId: id } });

    const saved = await savePracticeAction(id, [
      { answerId, content: "Token bucket", timeSpentSec: 30 },
    ]);
    expect(saved).toMatchObject({ ok: true, savedAt: expect.any(String) });

    await expect(
      submitPracticeAction(id, [{ answerId, content: "Token bucket + Redis", timeSpentSec: 60 }]),
    ).rejects.toThrow(`NEXT_REDIRECT:/practice/${id}`);

    const session = await db.prisma.practiceSession.findUniqueOrThrow({
      where: { id },
      include: { answers: true },
    });
    expect(session.status).toBe("SUBMITTED");
    expect(session.answers[0]).toMatchObject({ content: "Token bucket + Redis", timeSpentSec: 60 });

    // Saving after submit is refused; submitting again just lands on the review.
    expect(await savePracticeAction(id, [])).toEqual({ ok: false, error: "not_in_progress" });
    await expect(submitPracticeAction(id, [])).rejects.toThrow(`NEXT_REDIRECT:/practice/${id}`);
  });

  it("validates arguments before touching the database", async () => {
    expect(await savePracticeAction("", [])).toEqual({ ok: false, error: "invalid_request" });
    expect(
      await savePracticeAction("s1", [{ answerId: "a", content: "x", timeSpentSec: -5 }]),
    ).toEqual({ ok: false, error: "invalid_request" });
    expect(await submitPracticeAction("s1", "not an array" as unknown as [])).toEqual({
      ok: false,
      error: "invalid_request",
    });
  });

  it("treats another user's session as not found", async () => {
    const id = await start({ mode: "question", question: "design-rate-limiter" });
    vi.mocked(requireUser).mockResolvedValue({
      id: "someone-else",
      email: "eve@example.com",
      name: null,
      image: null,
    });
    expect(await savePracticeAction(id, [])).toEqual({ ok: false, error: "not_found" });
    expect(await submitPracticeAction(id, [])).toEqual({ ok: false, error: "not_found" });
  });
});
