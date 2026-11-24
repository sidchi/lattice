import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { requireUser } from "@/auth";

import DashboardPage from "./page";

vi.mock("@/auth", () => ({ requireUser: vi.fn() }));
vi.mock("next-auth/react", () => ({ signIn: vi.fn(), signOut: vi.fn() }));

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
