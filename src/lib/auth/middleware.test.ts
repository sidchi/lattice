// @vitest-environment node
import { encode } from "next-auth/jwt";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { config } from "@/middleware";

import { authMiddleware } from "./middleware";
import { PROTECTED_PREFIXES } from "./paths";

const secret = "m".repeat(32);
const SESSION_COOKIE = "next-auth.session-token";

async function request(path: string, token?: Record<string, unknown>, signedWith = secret) {
  const req = new NextRequest(new URL(path, "http://localhost:3000"));
  if (token) req.cookies.set(SESSION_COOKIE, await encode({ token, secret: signedWith }));
  return req;
}

function redirectTarget(res: Response): string | null {
  const location = res.headers.get("location");
  if (!location) return null;
  const url = new URL(location);
  return `${url.pathname}${url.search}`;
}

describe("authMiddleware", () => {
  it("lets a signed-in user through", async () => {
    const res = await authMiddleware(await request("/dashboard", { sub: "user_1" }), secret);
    expect(redirectTarget(res)).toBeNull();
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("redirects an anonymous user to sign-in with a return path", async () => {
    const res = await authMiddleware(await request("/practice/abc?q=1"), secret);
    expect(res.status).toBe(307);
    expect(redirectTarget(res)).toBe("/signin?callbackUrl=%2Fpractice%2Fabc%3Fq%3D1");
  });

  it("omits the return path for the default landing page", async () => {
    const res = await authMiddleware(await request("/dashboard"), secret);
    expect(redirectTarget(res)).toBe("/signin");
  });

  it("rejects a cookie encrypted with a different secret", async () => {
    const req = await request("/history", { sub: "user_1" }, "x".repeat(32));
    expect(redirectTarget(await authMiddleware(req, secret))).toBe(
      "/signin?callbackUrl=%2Fhistory",
    );
  });

  it("rejects a token without a subject", async () => {
    const res = await authMiddleware(await request("/dashboard", { email: "a@b.c" }), secret);
    expect(redirectTarget(res)).toBe("/signin");
  });

  it("treats everyone as signed out when auth is not configured", async () => {
    const res = await authMiddleware(await request("/dashboard", { sub: "user_1" }), undefined);
    expect(redirectTarget(res)).toBe("/signin");
  });

  it("ignores public paths even if the matcher sends them", async () => {
    const res = await authMiddleware(await request("/"), secret);
    expect(redirectTarget(res)).toBeNull();
  });
});

describe("middleware matcher", () => {
  it("covers exactly the protected prefixes", () => {
    expect(config.matcher).toEqual(PROTECTED_PREFIXES.map((prefix) => `${prefix}/:path*`));
  });
});
