import { describe, expect, it } from "vitest";

import {
  DEFAULT_AFTER_SIGN_IN,
  PROTECTED_PREFIXES,
  isProtectedPath,
  safeCallbackUrl,
  signInUrl,
} from "./paths";

describe("isProtectedPath", () => {
  it.each(PROTECTED_PREFIXES)("protects %s and its children", (prefix) => {
    expect(isProtectedPath(prefix)).toBe(true);
    expect(isProtectedPath(`${prefix}/abc`)).toBe(true);
  });

  it.each(["/", "/signin", "/api/health", "/dashboards", "/practiced", "/questions"])(
    "leaves %s public",
    (path) => {
      expect(isProtectedPath(path)).toBe(false);
    },
  );
});

describe("safeCallbackUrl", () => {
  it.each([
    ["/practice/abc", "/practice/abc"],
    ["/history?page=2#top", "/history?page=2#top"],
    ["/a/../dashboard", "/dashboard"],
  ])("keeps same-origin path %s", (input, expected) => {
    expect(safeCallbackUrl(input)).toBe(expected);
  });

  it.each([
    undefined,
    null,
    "",
    "dashboard",
    "https://evil.example/phish",
    "//evil.example",
    "/\\evil.example",
    "/\t/evil.example",
    "javascript:alert(1)",
    "/signin",
    "/signin?callbackUrl=/x",
  ])("falls back for %j", (input) => {
    expect(safeCallbackUrl(input)).toBe(DEFAULT_AFTER_SIGN_IN);
  });

  it("uses the first value of a repeated query parameter", () => {
    expect(safeCallbackUrl(["/history", "https://evil.example"])).toBe("/history");
  });

  it("honours a custom fallback", () => {
    expect(safeCallbackUrl("https://evil.example", "/")).toBe("/");
  });
});

describe("signInUrl", () => {
  it("omits the callback for the default landing page", () => {
    expect(signInUrl()).toBe("/signin");
    expect(signInUrl(DEFAULT_AFTER_SIGN_IN)).toBe("/signin");
  });

  it("encodes a return path", () => {
    expect(signInUrl("/practice/abc?q=1")).toBe("/signin?callbackUrl=%2Fpractice%2Fabc%3Fq%3D1");
  });

  it("drops unsafe return targets", () => {
    expect(signInUrl("https://evil.example")).toBe("/signin");
  });
});
