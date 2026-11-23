import { render, screen } from "@testing-library/react";
import { notFound } from "next/navigation";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { getPrisma } from "@/lib/db";
import { seedQuestionBank } from "@/lib/seed/seed";
import { createTestDatabase, type TestDatabase } from "@/test/db";

import QuestionPage, { generateMetadata } from "./page";

// Partial mock: tests build their own client with the real createPrismaClient().
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

beforeAll(async () => {
  db = createTestDatabase();
  await seedQuestionBank(db.prisma);
});

afterAll(async () => {
  await db.dispose();
});

beforeEach(() => {
  vi.mocked(getPrisma).mockReturnValue(db.prisma);
});

const params = (slug: string) => ({ params: Promise.resolve({ slug }) });

describe("QuestionPage", () => {
  it("renders the full question with badges and company links", async () => {
    render(await QuestionPage(params("design-payment-idempotency")));

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Design idempotent payment APIs",
    );
    expect(screen.getByText(/Clients retry charge requests on timeouts/)).toBeInTheDocument();
    expect(screen.getByText("System design")).toBeInTheDocument();
    expect(screen.getByText("Hard")).toBeInTheDocument();
    expect(screen.getByText(/Suggested time box: 45 min/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Stripe" })).toHaveAttribute(
      "href",
      "/questions?company=stripe",
    );
    expect(screen.getByRole("link", { name: /Question bank/ })).toHaveAttribute(
      "href",
      "/questions",
    );
  });

  it("calls notFound() for an unknown slug", async () => {
    await expect(QuestionPage(params("does-not-exist"))).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });
});

describe("generateMetadata", () => {
  it("uses the question title", async () => {
    expect(await generateMetadata(params("design-rate-limiter"))).toEqual({
      title: "Design a distributed rate limiter",
      description: "System design interview question.",
    });
  });

  it("has a fallback title for an unknown slug", async () => {
    expect(await generateMetadata(params("nope"))).toEqual({ title: "Question not found" });
  });
});
