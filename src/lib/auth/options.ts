import type { Account, NextAuthOptions, Profile } from "next-auth";
import GoogleProvider, { type GoogleProfile } from "next-auth/providers/google";

import type { AuthConfig } from "@/lib/env";

import { SIGN_IN_PATH } from "./paths";
import type { OAuthIdentity, UserStore } from "./users";

const DAY_SECONDS = 24 * 60 * 60;

/** Session lifetime. Rolling: any request after {@link SESSION_UPDATE_AGE} extends it. */
export const SESSION_MAX_AGE = 30 * DAY_SECONDS;
export const SESSION_UPDATE_AGE = DAY_SECONDS;

/**
 * Turns a provider profile into an identity we are willing to trust, or `null`.
 *
 * Accounts are keyed on email, so an unverified email would let someone claim another
 * person's history. Google reports `email_verified`; anything else is refused until it has
 * an equivalent check.
 */
export function identityFromProfile(
  account: Pick<Account, "provider"> | null | undefined,
  profile: Profile | undefined,
): OAuthIdentity | null {
  if (account?.provider !== "google" || !profile) return null;
  const google = profile as Partial<GoogleProfile>;
  if (google.email_verified !== true || !google.email) return null;
  return { email: google.email, name: google.name ?? null, image: google.picture ?? null };
}

type Callbacks = Required<
  Pick<NonNullable<NextAuthOptions["callbacks"]>, "signIn" | "jwt" | "session">
>;

/**
 * NextAuth callbacks, split out of {@link buildAuthOptions} so tests can drive them with a
 * mocked provider profile and no OAuth round trip.
 *
 * - `signIn` rejects identities we cannot trust (see {@link identityFromProfile}).
 * - `jwt` runs with the provider profile only on sign-in: it upserts our `User` row and
 *   stores *our* id in `token.sub`, replacing Google's subject id. Later requests just
 *   decrypt the cookie, with no database read.
 * - `session` exposes that id as `session.user.id` to server code and the client.
 */
export function createAuthCallbacks(users: UserStore): Callbacks {
  return {
    signIn({ account, profile }) {
      return identityFromProfile(account, profile) !== null;
    },

    async jwt({ token, account, profile }) {
      if (!account) return token;
      const identity = identityFromProfile(account, profile);
      if (!identity) throw new Error("jwt callback reached with an untrusted identity");
      const user = await users.upsertFromIdentity(identity);
      return { ...token, sub: user.id, email: user.email, name: user.name, picture: user.image };
    },

    session({ session, token }) {
      if (!token.sub || !token.email) return session;
      return {
        ...session,
        user: {
          id: token.sub,
          email: token.email,
          name: token.name ?? null,
          image: token.picture ?? null,
        },
      };
    },
  };
}

/**
 * Full NextAuth configuration. Pure: everything environment- or database-specific is passed
 * in, so tests build it without touching `process.env` or Prisma.
 */
export function buildAuthOptions(config: AuthConfig, users: UserStore): NextAuthOptions {
  return {
    secret: config.secret,
    // JWT sessions keep middleware database-free (it runs on the Edge runtime) and need no
    // session table. The trade-off is revocation: see the README's auth section.
    session: { strategy: "jwt", maxAge: SESSION_MAX_AGE, updateAge: SESSION_UPDATE_AGE },
    providers: [
      GoogleProvider({
        clientId: config.googleClientId,
        clientSecret: config.googleClientSecret,
        // Always show the account chooser, so signing out and back in can switch accounts.
        authorization: { params: { prompt: "select_account" } },
      }),
    ],
    pages: { signIn: SIGN_IN_PATH, error: SIGN_IN_PATH },
    callbacks: createAuthCallbacks(users),
  };
}
