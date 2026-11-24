import { render, screen, within } from "@testing-library/react";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { requireUser } from "@/auth";
import { getPrisma } from "@/lib/db";
import { RUBRICS } from "@/lib/feedback/rubric";
import { seedQuestionBank } from "@/lib/seed/seed";
import { createTestDatabase, type TestDatabase } from "@/test/db";

import HistoryPage from "./page";

vi.mock("@/auth", () => ({ requireUser: vi.fn() }));
vi.mock(import("@/lib/db"), async (importOriginal) => ({
  ...(await importOriginal()),
  getPrisma: vi.fn(),
}));

let db: TestDatabase;
let userId: string;

beforeAll(async () => {
  db = createTestDatabase();
  await seedQuestionBank(db.prisma);
});

afterAll(async () => {
  await db.dispose();
});

beforeEach(async () => {
  await db.prisma.user.deleteMany();
  userId = (await db.prisma.user.create({ data: { email: "ada@example.com" } })).id;
  vi.mocked(getPrisma).mockReturnValue(db.prisma);
  vi.mocked(requireUser).mockResolvedValue({
    id: userId,
    email: "ada@example.com",
    name: "Ada",
    image: null,
  });
});

/** The value of a headline stat tile. */
const stat = (label: string) => screen.getByText(label, { selector: "dt" }).nextElementSibling;

const page = (searchParams: Record<string, string> = {}) =>
  HistoryPage({ searchParams: Promise.resolve(searchParams) });

/** A submitted session for one system-design answer, scored by `evaluator` if `score` is set. */
async function session(
  day: number,
  {
    score,
    evaluator = "anthropic:model-a",
    tradeoffs,
  }: {
    score?: number;
    evaluator?: string;
    tradeoffs?: number;
  } = {},
) {
  const question = await db.prisma.question.findUniqueOrThrow({
    where: { slug: "design-rate-limiter" },
    select: { id: true },
  });
  const submittedAt = new Date(Date.UTC(2026, 10, day, 9));
  return db.prisma.practiceSession.create({
    data: {
      userId,
      status: "SUBMITTED",
      timeLimitSec: 2_700,
      startedAt: submittedAt,
      submittedAt,
      answers: {
        create: {
          questionId: question.id,
          position: 0,
          content: "Token bucket.",
          timeSpentSec: 1_500,
          submittedAt,
          ...(score !== undefined && {
            feedback: {
              create: {
                overallScore: score,
                summary: "Summary.",
                evaluator,
                scores: {
                  create: RUBRICS.SYSTEM_DESIGN.dimensions.map((dimension) => ({
                    dimension: dimension.key,
                    score: dimension.key === "tradeoffs" ? (tradeoffs ?? score) : score,
                  })),
                },
              },
            },
          }),
        },
      },
    },
    select: { id: true },
  });
}

describe("HistoryPage", () => {
  it("requires a user and shows an empty state without history", async () => {
    render(await page());

    expect(requireUser).toHaveBeenCalledWith("/history");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("History & progress");
    expect(screen.getByText(/No submitted sessions yet/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Start practicing" })).toHaveAttribute(
      "href",
      "/practice",
    );
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("shows headline numbers, the trend, focus areas and categories", async () => {
    await session(1, { score: 2, tradeoffs: 1 });
    await session(2, { score: 4, tradeoffs: 2 });

    render(await page());

    expect(stat("Sessions completed")).toHaveTextContent("2");
    expect(stat("Average score")).toHaveTextContent("3.0 / 5");
    expect(stat("Time practiced")).toHaveTextContent("50 min");

    expect(screen.getByText(/^Improving \(\+2\.0\)/)).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /Average score per session\. 2 sessions/ }),
    ).toBeVisible();

    const focus = screen.getByRole("heading", { name: "Focus areas" }).parentElement!;
    const areas = within(focus).getAllByRole("listitem");
    expect(within(areas[0]!).getByRole("heading", { level: 3 })).toHaveTextContent("Trade-offs");
    expect(areas[0]).toHaveTextContent("1.5 / 5 · 2 scores");
    expect(within(areas[0]!).getByRole("link")).toHaveAttribute(
      "href",
      "/questions?category=system-design",
    );

    const categories = screen.getByRole("heading", { name: "By category" }).parentElement!;
    expect(within(categories).getByRole("rowheader")).toHaveTextContent("System design");
  });

  it("lists past sessions newest first, including unscored ones", async () => {
    const scored = await session(1, { score: 3 });
    const unscored = await session(2);

    render(await page());

    const list = screen.getByRole("heading", { name: "Past sessions" }).parentElement!;
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]!).getByRole("link")).toHaveAttribute("href", `/practice/${unscored.id}`);
    expect(items[0]).toHaveTextContent("No feedback yet");
    expect(within(items[1]!).getByRole("link")).toHaveAttribute("href", `/practice/${scored.id}`);
    expect(items[1]).toHaveTextContent("3.0 / 5");
  });

  it("offers an evaluator filter only when scores come from several evaluators", async () => {
    await session(1, { score: 2, evaluator: "heuristic-v1" });
    const { unmount } = render(await page());
    expect(screen.queryByLabelText("Scored by")).not.toBeInTheDocument();
    expect(screen.getByText(/offline heuristic/)).toBeInTheDocument();
    unmount();

    await session(2, { score: 4 });
    const { unmount: unmountAll } = render(await page());
    expect(screen.getByLabelText("Scored by")).toHaveDisplayValue("All evaluators");
    expect(screen.getByText(/grade on different curves/)).toBeInTheDocument();
    unmountAll();

    render(await page({ scoredBy: "anthropic:model-a" }));
    expect(screen.getByLabelText("Scored by")).toHaveDisplayValue("Anthropic · model-a");
    expect(screen.queryByText(/grade on different curves/)).not.toBeInTheDocument();
    expect(stat("Average score")).toHaveTextContent("4.0 / 5");
  });

  it("ignores an evaluator the user has no scores from", async () => {
    await session(1, { score: 2 });
    render(await page({ scoredBy: "openai:not-mine" }));
    expect(stat("Average score")).toHaveTextContent("2.0 / 5");
  });

  it("paginates the session list, keeping the evaluator in the links", async () => {
    for (let day = 1; day <= 12; day++) await session(day, { score: 3 });
    await session(13, { score: 3, evaluator: "heuristic-v1" });

    render(await page({ page: "2", scoredBy: "anthropic:model-a" }));

    const nav = screen.getByRole("navigation", { name: "Pagination" });
    expect(nav).toHaveTextContent("Page 2 of 2");
    expect(within(nav).getByRole("link", { name: "← Newer" })).toHaveAttribute(
      "href",
      "/history?scoredBy=anthropic%3Amodel-a",
    );
    expect(within(nav).queryByRole("link", { name: "Older →" })).not.toBeInTheDocument();
    const list = screen.getByRole("heading", { name: "Past sessions" }).parentElement!;
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
  });
});
