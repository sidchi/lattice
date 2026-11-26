import { mintSessionToken, SESSION_COOKIE } from "./support/auth";
import { E2E_BASE_URL, E2E_GOOGLE_CLIENT_ID } from "./support/env";
import { expect, test } from "./support/fixtures";

async function googleDiscoveryReachable(): Promise<boolean> {
  try {
    const response = await fetch("https://accounts.google.com/.well-known/openid-configuration", {
      signal: AbortSignal.timeout(5_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

test.describe("signed out", () => {
  test("protected pages redirect to sign-in with a return path", async ({ page }) => {
    for (const path of ["/dashboard", "/practice", "/history"]) {
      await page.goto(path);
      const expected =
        path === "/dashboard" ? "/signin" : `/signin?callbackUrl=${encodeURIComponent(path)}`;
      expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe(expected);
      await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
    }
  });

  test("Continue with Google starts the OAuth flow with the right parameters", async ({ page }) => {
    // NextAuth's server fetches Google's OpenID discovery document to build the authorization
    // URL, so this one test needs outbound network. CI has it; an offline laptop may not.
    test.skip(
      !process.env.CI && !(await googleDiscoveryReachable()),
      "Google's OpenID discovery document is unreachable from this machine",
    );

    // Stop at Google's door: the request is captured and answered locally, never sent.
    let authorizeUrl: URL | undefined;
    await page.route("https://accounts.google.com/**", async (route) => {
      authorizeUrl = new URL(route.request().url());
      await route.fulfill({ contentType: "text/html", body: "<title>Google (stub)</title>" });
    });

    await page.goto("/signin?callbackUrl=%2Fhistory");
    await page.getByRole("button", { name: "Continue with Google" }).click();
    await expect(page).toHaveTitle("Google (stub)");

    expect(authorizeUrl).toBeDefined();
    const params = authorizeUrl!.searchParams;
    expect(authorizeUrl!.pathname).toBe("/o/oauth2/v2/auth");
    expect(params.get("client_id")).toBe(E2E_GOOGLE_CLIENT_ID);
    expect(params.get("redirect_uri")).toBe(`${E2E_BASE_URL}/api/auth/callback/google`);
    expect(params.get("response_type")).toBe("code");
    expect(params.get("prompt")).toBe("select_account");
    expect(params.get("scope")?.split(" ")).toEqual(
      expect.arrayContaining(["openid", "email", "profile"]),
    );
    // NextAuth binds the callback to this browser with a state/PKCE check.
    expect(params.get("state") ?? params.get("code_challenge")).toBeTruthy();

    // The return path survives the round trip in NextAuth's callback-url cookie.
    const cookies = await page.context().cookies(E2E_BASE_URL);
    const callback = cookies.find((cookie) => cookie.name === "next-auth.callback-url");
    expect(decodeURIComponent(callback?.value ?? "")).toBe(`${E2E_BASE_URL}/history`);
  });

  test("OAuth errors show fixed copy, never the raw query", async ({ page }) => {
    // Scoped to <main>: Next.js adds its own (empty) route-announcer alert to every page.
    await page.goto("/signin?error=AccessDenied");
    await expect(page.getByRole("main").getByRole("alert")).toHaveText(/verified email address/);

    await page.goto("/signin?error=%3Cscript%3Ealert(1)%3C%2Fscript%3E");
    await expect(page.getByRole("main").getByRole("alert")).toHaveText(
      "Something went wrong while signing in. Please try again.",
    );
  });

  test("a session cookie signed with another secret is ignored", async ({ page, personas }) => {
    const forged = await mintSessionToken(
      personas.ada,
      "attacker-secret-attacker-secret-0123456789",
    );
    await page.context().addCookies([{ name: SESSION_COOKIE, value: forged, url: E2E_BASE_URL }]);

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/signin$/);
  });
});

test.describe("signed in", () => {
  test("lands on the callback URL and shows the dashboard", async ({ page, signIn }) => {
    const ada = await signIn("ada");

    await page.goto("/signin?callbackUrl=%2Fhistory");
    await expect(page).toHaveURL(/\/history$/);

    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Welcome, ${ada.name}`);
    await expect(page.getByText(`Signed in as ${ada.email}`)).toBeVisible();
  });

  test("an off-site callback URL falls back to the dashboard", async ({ page, signIn }) => {
    await signIn("ada");
    await page.goto("/signin?callbackUrl=https%3A%2F%2Fevil.example%2Fphish");
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("signing out ends the session", async ({ page, signIn }) => {
    await signIn("ada");
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(`${E2E_BASE_URL}/`);

    await page.goto("/practice");
    await expect(page).toHaveURL(/\/signin\?callbackUrl=%2Fpractice$/);
  });
});
