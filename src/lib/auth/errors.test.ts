import { describe, expect, it } from "vitest";

import { signInErrorMessage } from "./errors";

describe("signInErrorMessage", () => {
  it("is null without an error", () => {
    expect(signInErrorMessage(undefined)).toBeNull();
    expect(signInErrorMessage("")).toBeNull();
  });

  it("explains known NextAuth codes", () => {
    expect(signInErrorMessage("AccessDenied")).toMatch(/verified email/);
  });

  it("never echoes unknown input", () => {
    const message = signInErrorMessage("<script>alert(1)</script>");
    expect(message).toMatch(/Something went wrong/);
    expect(signInErrorMessage("toString")).toBe(message);
  });

  it("uses the first of repeated parameters", () => {
    expect(signInErrorMessage(["OAuthCallback", "AccessDenied"])).toMatch(/did not complete/);
  });
});
