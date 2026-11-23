import { fireEvent, render, screen } from "@testing-library/react";
import { signIn, signOut } from "next-auth/react";
import { describe, expect, it, vi } from "vitest";

import { GoogleSignInButton, SignOutButton } from "./auth-buttons";

vi.mock("next-auth/react", () => ({ signIn: vi.fn(), signOut: vi.fn() }));

describe("GoogleSignInButton", () => {
  it("starts Google sign-in with the callback URL and disables itself", () => {
    render(<GoogleSignInButton callbackUrl="/practice/abc" />);
    const button = screen.getByRole("button", { name: "Continue with Google" });

    fireEvent.click(button);

    expect(signIn).toHaveBeenCalledWith("google", { callbackUrl: "/practice/abc" });
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent("Redirecting to Google…");
  });
});

describe("SignOutButton", () => {
  it("signs out back to the landing page", () => {
    render(<SignOutButton />);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/" });
  });
});
