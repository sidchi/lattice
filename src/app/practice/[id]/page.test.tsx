import { render, screen } from "@testing-library/react";
import { notFound } from "next/navigation";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { requireUser } from "@/auth";
import { getPrisma } from "@/lib/db";
import { saveProgress, startSession, submitSession } from "@/lib/practice/service";
import { seedQuestionBank } from "@/lib/seed/seed";
import { createTestDatabase, type TestDatabase } from "@/test/db";

import PracticeSessionPage from "./page";

vi.mock("@/auth", () => ({ requireUser: vi.fn() }));
vi.mock("../actions", () => ({ savePracticeAction: vi.fn(), submitPracticeAction: vi.fn() }));
vi.mock(import("@/lib/db"), async (importOriginal) => ({
  ...(await importOriginal()),
  getPrisma: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
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

async function newSession(now?: Date): Promise<string> {
  const result = await startSession(
    db.prisma,
    userId,
    { mode: "question", question: "design-rate-limiter" },
    { now },
  );
  if (!result.ok) throw new Error(result.error);
  return result.value.id;
}

const page = (id: string) => PracticeSessionPage({ params: Promise.resolve({ id }) });

describe("PracticeSessionPage", () => {
  it("renders the timed runner for an in-progress session", async () => {
    const id = await newSession();
    render(await page(id));

    expect(requireUser).toHaveBeenCalledWith(`/practice/${id}`);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Mock interview");
    expect(
      screen.getByRole("heading", { name: "Design a distributed rate limiter" }),
    ).toBeVisible();
    expect(screen.getByRole("timer")).toHaveTextContent(/^4[45]:\d\d$/);
    expect(screen.getByLabelText("Your answer")).toBeInTheDocument();
  });

  it("renders a read-only review once submitted", async () => {
    const id = await newSession();
    const answer = await db.prisma.answer.findFirstOrThrow({ where: { sessionId: id } });
    await saveProgress(db.prisma, userId, id, [
      { answerId: answer.id, content: "Sliding window counters", timeSpentSec: 125 },
    ]);
    await submitSession(db.prisma, userId, id, []);

    render(await page(id));

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Session submitted");
    expect(screen.getByText("Sliding window counters")).toBeInTheDocument();
    expect(screen.getByText("Time spent: 2 min")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Design a distributed rate limiter" })).toHaveAttribute(
      "href",
      "/questions/design-rate-limiter",
    );
    expect(screen.queryByLabelText("Your answer")).not.toBeInTheDocument();
  });

  it("finalizes an expired session and shows the review", async () => {
    const id = await newSession(new Date("2020-01-01T00:00:00Z"));
    render(await page(id));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Session submitted");
    expect(screen.getByText("No answer written.")).toBeInTheDocument();
  });

  it("404s for a session owned by someone else", async () => {
    const id = await newSession();
    vi.mocked(requireUser).mockResolvedValue({
      id: "someone-else",
      email: "eve@example.com",
      name: null,
      image: null,
    });
    await expect(page(id)).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });
});
