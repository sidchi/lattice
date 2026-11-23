import { describe, expect, it } from "vitest";

import { EnvValidationError, getAuthConfig, parseServerEnv } from "./env";

describe("parseServerEnv", () => {
  it("accepts an empty environment and defaults NODE_ENV", () => {
    expect(parseServerEnv({})).toEqual({ NODE_ENV: "development" });
  });

  it("treats empty strings as unset", () => {
    const env = parseServerEnv({ NODE_ENV: "test", DATABASE_URL: "", NEXTAUTH_URL: "" });
    expect(env).toEqual({ NODE_ENV: "test" });
  });

  it("accepts a fully configured environment", () => {
    const env = parseServerEnv({
      NODE_ENV: "production",
      DATABASE_URL: "file:./dev.db",
      NEXTAUTH_URL: "https://lattice.example.com",
      NEXTAUTH_SECRET: "x".repeat(32),
      GOOGLE_CLIENT_ID: "client-id",
      GOOGLE_CLIENT_SECRET: "client-secret",
    });
    expect(env.NEXTAUTH_URL).toBe("https://lattice.example.com");
  });

  it("rejects an unknown NODE_ENV", () => {
    expect(() => parseServerEnv({ NODE_ENV: "staging" })).toThrow(EnvValidationError);
  });

  it("rejects a malformed NEXTAUTH_URL and names the variable", () => {
    expect(() => parseServerEnv({ NEXTAUTH_URL: "not a url" })).toThrow(/NEXTAUTH_URL/);
  });

  it("rejects a short NEXTAUTH_SECRET", () => {
    expect(() => parseServerEnv({ NEXTAUTH_SECRET: "too-short" })).toThrow(/at least 32/);
  });

  it("requires Google OAuth credentials as a pair", () => {
    expect(() => parseServerEnv({ GOOGLE_CLIENT_ID: "client-id" })).toThrow(/set together/);
  });

  it("requires NEXTAUTH_SECRET once Google sign-in is configured", () => {
    expect(() =>
      parseServerEnv({ GOOGLE_CLIENT_ID: "client-id", GOOGLE_CLIENT_SECRET: "client-secret" }),
    ).toThrow(/NEXTAUTH_SECRET is required/);
  });

  it("reports every issue at once", () => {
    try {
      parseServerEnv({ NODE_ENV: "staging", NEXTAUTH_URL: "nope" });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError);
      expect((error as EnvValidationError).issues).toHaveLength(2);
    }
  });
});

describe("getAuthConfig", () => {
  const secret = "s".repeat(32);

  it("is null when Google OAuth is not configured", () => {
    expect(getAuthConfig(parseServerEnv({ NEXTAUTH_SECRET: secret }))).toBeNull();
  });

  it("returns the Google credentials and secret when fully configured", () => {
    const env = parseServerEnv({
      NEXTAUTH_SECRET: secret,
      GOOGLE_CLIENT_ID: "client-id",
      GOOGLE_CLIENT_SECRET: "client-secret",
    });
    expect(getAuthConfig(env)).toEqual({
      googleClientId: "client-id",
      googleClientSecret: "client-secret",
      secret,
    });
  });
});
