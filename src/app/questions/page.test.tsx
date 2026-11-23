import { render, screen, within } from "@testing-library/react";
import { redirect } from "next/navigation";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { getPrisma } from "@/lib/db";
import { PAGE_SIZE } from "@/lib/questions/filters";
import { seedQuestionBank } from "@/lib/seed/seed";
import { createTestDatabase, type TestDatabase } from "@/test/db";

import QuestionsPage from "./page";

// Partial mock: tests build their own client with the real createPrismaClient().
vi.mock(import("@/lib/db"), async (importOriginal) => ({
  ...(await importOriginal()),
  getPrisma: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

// The page runs against a real SQLite database loaded with the real seed, so these tests
// cover the query layer and the rendering together. Read-only, so one database is shared.
let db: TestDatabase;
let total: number;

beforeAll(async () => {
  db = createTestDatabase();
  await seedQuestionBank(db.prisma);
  total = await db.prisma.question.count();
});

afterAll(async () => {
  await db.dispose();
});

beforeEach(() => {
  vi.mocked(getPrisma).mockReturnValue(db.prisma);
});

async function renderPage(params: Record<string, string | string[]> = {}) {
  render(await QuestionsPage({ searchParams: Promise.resolve(params) }));
}

function resultList() {
  return within(screen.getByRole("region", { name: "Results" })).queryAllByRole("article");
}

describe("QuestionsPage", () => {
  it("lists the first page of the whole bank", async () => {
    await renderPage();

    expect(screen.getByRole("heading", { level: 1, name: "Question bank" })).toBeInTheDocument();
    expect(resultList()).toHaveLength(PAGE_SIZE);
    expect(screen.getByRole("status")).toHaveTextContent(
      `Showing 1–${PAGE_SIZE} of ${total} questions`,
    );
    expect(screen.queryByRole("link", { name: "Clear" })).not.toBeInTheDocument();
  });

  it("links each question to its detail page", async () => {
    await renderPage();
    const first = await db.prisma.question.findFirst({ orderBy: [{ title: "asc" }] });
    expect(screen.getByRole("link", { name: first!.title })).toHaveAttribute(
      "href",
      `/questions/${first!.slug}`,
    );
  });

  it("filters by category and difficulty and shows facet counts", async () => {
    await renderPage({ category: "coding", difficulty: "hard" });

    const expected = await db.prisma.question.count({
      where: { category: "CODING", difficulty: "HARD" },
    });
    expect(expected).toBeGreaterThan(0);
    expect(resultList()).toHaveLength(expected);
    for (const article of resultList()) {
      expect(within(article).getByText("Coding")).toBeInTheDocument();
      expect(within(article).getByText("Hard")).toBeInTheDocument();
    }

    const category = screen.getByLabelText<HTMLSelectElement>("Category");
    expect(category.value).toBe("coding");
    expect(screen.getByLabelText<HTMLSelectElement>("Difficulty").value).toBe("hard");
    expect(screen.getByRole("link", { name: "Clear" })).toHaveAttribute("href", "/questions");
  });

  it("filters by company", async () => {
    await renderPage({ company: "stripe" });
    const expected = await db.prisma.question.count({
      where: { companies: { some: { company: { slug: "stripe" } } } },
    });
    expect(resultList()).toHaveLength(expected);
    for (const article of resultList()) expect(article).toHaveTextContent("Stripe");
  });

  it("shows an empty state with a way out", async () => {
    await renderPage({ company: "no-such-company" });
    expect(resultList()).toHaveLength(0);
    expect(screen.getByRole("status")).toHaveTextContent("No questions match these filters.");
    expect(screen.getByRole("link", { name: "Clear all filters" })).toHaveAttribute(
      "href",
      "/questions",
    );
  });

  it("paginates with links that keep the filters", async () => {
    await renderPage({ page: "2" });
    const nav = screen.getByRole("navigation", { name: "Pagination" });
    expect(within(nav).getByRole("link", { name: /Previous/ })).toHaveAttribute(
      "href",
      "/questions",
    );
    expect(nav).toHaveTextContent(`Page 2 of ${Math.ceil(total / PAGE_SIZE)}`);
  });

  it.each([
    [{ category: "", difficulty: "", company: "" }, "/questions"],
    [{ category: "", difficulty: "easy", company: "" }, "/questions?difficulty=easy"],
    [{ company: "stripe", category: "coding" }, "/questions?category=coding&company=stripe"],
    [{ category: "nonsense" }, "/questions"],
    [{ page: "1" }, "/questions"],
    [{ utm_source: "newsletter" }, "/questions"],
  ])("redirects %j to the canonical %s", async (params, canonical) => {
    await expect(renderPage(params)).rejects.toThrow(`NEXT_REDIRECT:${canonical}`);
    expect(redirect).toHaveBeenCalledWith(canonical);
  });

  it("clamps a page past the end to the last page", async () => {
    const last = `/questions?page=${Math.ceil(total / PAGE_SIZE)}`;
    await expect(renderPage({ page: "999" })).rejects.toThrow(`NEXT_REDIRECT:${last}`);
  });

  it("does not redirect a canonical URL", async () => {
    await renderPage({ category: "behavioral", page: "1" }).catch(() => undefined);
    vi.mocked(redirect).mockClear();
    await renderPage({ category: "behavioral" });
    expect(redirect).not.toHaveBeenCalled();
  });
});
