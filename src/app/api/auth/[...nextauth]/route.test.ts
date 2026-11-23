// @vitest-environment node
import NextAuth from "next-auth";
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import { getAuthOptions } from "@/auth";

import { GET, POST } from "./route";

vi.mock("next-auth", () => ({ default: vi.fn(async () => new Response("ok")) }));
vi.mock("@/auth", () => ({ getAuthOptions: vi.fn() }));

const context = { params: Promise.resolve({ nextauth: ["session"] }) };
const req = () => new NextRequest("http://localhost:3000/api/auth/session");

describe("/api/auth/[...nextauth]", () => {
  it("answers 503 when sign-in is not configured", async () => {
    vi.mocked(getAuthOptions).mockReturnValue(null);
    const res = await GET(req(), context);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "Sign-in is not configured on this server." });
    expect(NextAuth).not.toHaveBeenCalled();
  });

  it("delegates to NextAuth with the resolved options", async () => {
    const options = { providers: [] };
    vi.mocked(getAuthOptions).mockReturnValue(options);
    const request = req();
    const res = await POST(request, context);
    expect(await res.text()).toBe("ok");
    expect(NextAuth).toHaveBeenCalledWith(request, context, options);
  });
});
