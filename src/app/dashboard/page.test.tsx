import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireUser } from "@/auth";
import { getProgressSummary, type ProgressSummary } from "@/lib/history/service";

import DashboardPage from "./page";

vi.mock("@/auth", () => ({ requireUser: vi.fn() }));
vi.mock("next-auth/react", () => ({ signIn: vi.fn(), signOut: vi.fn() }));
vi.mock("@/lib/db", () => ({ getPrisma: vi.fn(() => ({})) }));
vi.mock("@/lib/history/service", () => ({ getProgressSummary: vi.fn() }));

const emptyProgress: ProgressSummary = {
  sessionsCompleted: 0,
  answersScored: 0,
  averageScore: null,
  timePracticedSec: 0,
  trend: [],
  recentTrend: null,
  weakAreas: [],
  categories: [],
  evaluators: [],
};

beforeEach(() => {
  vi.mocked(getProgressSummary).mockResolvedValue(emptyProgress);
});

describe("DashboardPage", () => {
  it("requires a user and greets them", async () => {
    vi.mocked(requireUser).mockResolvedValue({
      id: "user_1",
      email: "ada@example.com",
      name: "Ada Lovelace",
      image: null,
    });

    render(await DashboardPage());

    expect(requireUser).toHaveBeenCalledWith("/dashboard");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Welcome, Ada Lovelace");
    expect(screen.getByText("Signed in as ada@example.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Start practicing" })).toHaveAttribute(
      "href",
      "/practice",
    );
    expect(screen.getByRole("link", { name: "Browse the question bank" })).toHaveAttribute(
      "href",
      "/questions",
    );
  });

  it("hides the progress snapshot until a session is completed", async () => {
    vi.mocked(requireUser).mockResolvedValue({
      id: "user_1",
      email: "ada@example.com",
      name: "Ada",
      image: null,
    });
    render(await DashboardPage());
    expect(getProgressSummary).toHaveBeenCalledWith(expect.anything(), "user_1");
    expect(screen.queryByRole("heading", { name: "Your progress" })).not.toBeInTheDocument();
  });

  it("summarizes progress and links to history", async () => {
    vi.mocked(requireUser).mockResolvedValue({
      id: "user_1",
      email: "ada@example.com",
      name: "Ada",
      image: null,
    });
    vi.mocked(getProgressSummary).mockResolvedValue({
      ...emptyProgress,
      sessionsCompleted: 4,
      answersScored: 6,
      averageScore: 3.25,
      weakAreas: [
        {
          dimension: "tradeoffs",
          label: "Trade-offs",
          averageScore: 2,
          samples: 3,
          criteria: null,
          categories: ["SYSTEM_DESIGN"],
        },
      ],
    });

    render(await DashboardPage());

    expect(screen.getByRole("heading", { name: "Your progress" })).toBeInTheDocument();
    expect(screen.getByText("Sessions completed").nextElementSibling).toHaveTextContent("4");
    expect(screen.getByText("Average score").nextElementSibling).toHaveTextContent("3.3 / 5");
    expect(screen.getByText("Focus area").nextElementSibling).toHaveTextContent("Trade-offs");
    expect(screen.getByRole("link", { name: "History & progress →" })).toHaveAttribute(
      "href",
      "/history",
    );
  });

  it("falls back to the email when the profile has no name", async () => {
    vi.mocked(requireUser).mockResolvedValue({
      id: "user_1",
      email: "ada@example.com",
      name: null,
      image: null,
    });
    render(await DashboardPage());
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Welcome, ada@example.com");
  });

  it("propagates the sign-in redirect", async () => {
    vi.mocked(requireUser).mockRejectedValue(new Error("NEXT_REDIRECT:/signin"));
    await expect(DashboardPage()).rejects.toThrow("NEXT_REDIRECT:/signin");
  });
});
