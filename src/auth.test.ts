import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));
vi.mock("next/server", () => ({ connection: vi.fn(async () => undefined) }));
// Keep Prisma out of these tests: the store is never called without a real sign-in.
vi.mock("@/lib/db", () => ({ getPrisma: vi.fn(() => ({})) }));

const configured = {
  NEXTAUTH_SECRET: "s".repeat(32),
  GOOGLE_CLIENT_ID: "client-id",
  GOOGLE_CLIENT_SECRET: "client-secret",
};

/** `src/auth.ts` and `env.ts` cache per process, so each test gets fresh modules. */
async function loadAuth(env: Record<string, string> = configured) {
  vi.resetModules();
  for (const key of Object.keys(configured)) vi.stubEnv(key, "");
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  return import("./auth");
}

describe("src/auth", () => {
  beforeEach(() => {
    vi.mocked(getServerSession).mockReset();
  });

  it("disables auth when Google OAuth is not configured", async () => {
    const auth = await loadAuth({});
    expect(auth.isAuthEnabled()).toBe(false);
    expect(await auth.getCurrentUser()).toBeNull();
    expect(getServerSession).not.toHaveBeenCalled();
  });

  it("builds options once when configured", async () => {
    const auth = await loadAuth();
    expect(auth.isAuthEnabled()).toBe(true);
    expect(auth.getAuthOptions()).toBe(auth.getAuthOptions());
  });

  it("returns the session user", async () => {
    const auth = await loadAuth();
    vi.mocked(getServerSession).mockResolvedValue({
      expires: "2099-01-01T00:00:00.000Z",
      user: { id: "user_1", email: "ada@example.com", name: "Ada" },
    });
    expect(await auth.getCurrentUser()).toEqual({
      id: "user_1",
      email: "ada@example.com",
      name: "Ada",
      image: null,
    });
  });

  it("requireUser returns the user when signed in", async () => {
    const auth = await loadAuth();
    vi.mocked(getServerSession).mockResolvedValue({
      expires: "2099-01-01T00:00:00.000Z",
      user: { id: "user_1", email: "ada@example.com" },
    });
    await expect(auth.requireUser("/dashboard")).resolves.toMatchObject({ id: "user_1" });
  });

  it("requireUser redirects to sign-in with a return path when signed out", async () => {
    const auth = await loadAuth();
    vi.mocked(getServerSession).mockResolvedValue(null);
    await expect(auth.requireUser("/history")).rejects.toThrow(
      "NEXT_REDIRECT:/signin?callbackUrl=%2Fhistory",
    );
    expect(redirect).toHaveBeenCalledWith("/signin?callbackUrl=%2Fhistory");
  });
});
