import { render, screen } from "@testing-library/react";
import { redirect } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getCurrentUser, isAuthEnabled } from "@/auth";

import SignInPage from "./page";

vi.mock("@/auth", () => ({ getCurrentUser: vi.fn(), isAuthEnabled: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));
vi.mock("next-auth/react", () => ({ signIn: vi.fn(), signOut: vi.fn() }));

async function renderPage(params: Record<string, string> = {}) {
  render(await SignInPage({ searchParams: Promise.resolve(params) }));
}

describe("SignInPage", () => {
  beforeEach(() => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    vi.mocked(isAuthEnabled).mockReturnValue(true);
  });

  it("offers Google sign-in when configured", async () => {
    await renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("explains setup when sign-in is not configured", async () => {
    vi.mocked(isAuthEnabled).mockReturnValue(false);
    await renderPage();
    expect(screen.getByRole("heading", { name: "Sign-in is not configured" })).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows a friendly error for NextAuth error codes", async () => {
    await renderPage({ error: "AccessDenied" });
    expect(screen.getByRole("alert")).toHaveTextContent(/verified email/);
  });

  it("sends an already signed-in user to a safe callback URL", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: "user_1",
      email: "ada@example.com",
      name: null,
      image: null,
    });
    await expect(renderPage({ callbackUrl: "https://evil.example" })).rejects.toThrow(
      "NEXT_REDIRECT:/dashboard",
    );
    expect(redirect).toHaveBeenCalledWith("/dashboard");
  });
});
