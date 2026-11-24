import { render, screen, within } from "@testing-library/react";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { requireUser } from "@/auth";
import { getPrisma } from "@/lib/db";
import { startSession } from "@/lib/practice/service";
import { seedQuestionBank } from "@/lib/seed/seed";
import { createTestDatabase, type TestDatabase } from "@/test/db";

import PracticePage from "./page";

vi.mock("@/auth", () => ({ requireUser: vi.fn() }));
vi.mock("./actions", () => ({ startPracticeAction: vi.fn() }));
vi.mock(import("@/lib/db"), async (importOriginal) => ({
  ...(await importOriginal()),
  getPrisma: vi.fn(),
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

const page = (searchParams: Record<string, string> = {}) =>
  PracticePage({ searchParams: Promise.resolve(searchParams) });

describe("PracticePage", () => {
  it("requires a user and renders the start form with every option", async () => {
    render(await page());

    expect(requireUser).toHaveBeenCalledWith("/practice");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Practice");
    expect(screen.getByLabelText("Category")).toHaveDisplayValue("Any category");
    expect(within(screen.getByLabelText("Difficulty")).getAllByRole("option")).toHaveLength(4);
    expect(within(screen.getByLabelText("Questions")).getAllByRole("option")).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument();
    expect(screen.getByText("No sessions yet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "History & progress →" })).toHaveAttribute(
      "href",
      "/history",
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a known start error, and ignores unknown codes", async () => {
    const { unmount } = render(await page({ error: "no_questions" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/No questions match/);
    unmount();

    render(await page({ error: "<img src=x>" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("lists recent sessions with their status", async () => {
    const started = await startSession(db.prisma, userId, {
      mode: "question",
      question: "design-rate-limiter",
    });
    // An old session past its deadline reads as submitted even before it is opened.
    await startSession(
      db.prisma,
      userId,
      { mode: "question", question: "design-payment-idempotency" },
      { now: new Date("2020-01-01T00:00:00Z") },
    );

    render(await page());

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]!).getByRole("link")).toHaveAttribute(
      "href",
      `/practice/${started.ok ? started.value.id : ""}`,
    );
    expect(items[0]).toHaveTextContent("In progress");
    expect(items[1]).toHaveTextContent("Design idempotent payment APIs");
    expect(items[1]).toHaveTextContent("Submitted");
  });
});
