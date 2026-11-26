import type { BrowserContext } from "@playwright/test";
import { encode } from "next-auth/jwt";

import { E2E_BASE_URL, E2E_NEXTAUTH_SECRET } from "./env";
import type { ProvisionedPersona } from "./personas";

/** NextAuth v4's cookie name over plain HTTP (`__Secure-` prefixed over HTTPS). */
export const SESSION_COOKIE = "next-auth.session-token";

/**
 * The encrypted session JWT NextAuth issues at the end of a Google sign-in, with the claims
 * our `jwt` callback sets (`sub` is *our* user id, not Google's).
 *
 * The suite can't complete a real Google login, so it stops the OAuth flow at the redirect
 * to Google (see auth.spec.ts) and starts signed-in tests from this cookie instead. Everything
 * downstream (middleware, `getServerSession`, `requireUser`, ownership checks) runs for real.
 */
export async function mintSessionToken(
  persona: ProvisionedPersona,
  secret: string = E2E_NEXTAUTH_SECRET,
): Promise<string> {
  return encode({
    secret,
    token: { sub: persona.id, email: persona.email, name: persona.name, picture: null },
  });
}

export async function signInAs(
  context: BrowserContext,
  persona: ProvisionedPersona,
  secret?: string,
): Promise<void> {
  const value = await mintSessionToken(persona, secret);
  await context.addCookies([
    { name: SESSION_COOKIE, value, url: E2E_BASE_URL, httpOnly: true, sameSite: "Lax" },
  ]);
}
