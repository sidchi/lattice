import type { Account, Profile, Session } from "next-auth";
import type { JWT } from "next-auth/jwt";
import { describe, expect, it } from "vitest";

import {
  SESSION_MAX_AGE,
  buildAuthOptions,
  createAuthCallbacks,
  identityFromProfile,
} from "./options";
import { SIGN_IN_PATH } from "./paths";
import { createInMemoryUserStore } from "./users";

// A mocked Google provider: the account and ID-token profile NextAuth hands the callbacks
// after the OAuth code exchange. Synthetic values only.
const googleAccount = {
  provider: "google",
  type: "oauth",
  providerAccountId: "1234567890",
} satisfies Account;

function googleProfile(overrides: Record<string, unknown> = {}): Profile {
  return {
    sub: "1234567890",
    email: "Ada@Example.com",
    email_verified: true,
    name: "Ada Lovelace",
    picture: "https://example.com/ada.png",
    ...overrides,
  } as Profile;
}

const config = {
  googleClientId: "client-id",
  googleClientSecret: "client-secret",
  secret: "s".repeat(32),
};

describe("identityFromProfile", () => {
  it("maps a verified Google profile", () => {
    expect(identityFromProfile(googleAccount, googleProfile())).toEqual({
      email: "Ada@Example.com",
      name: "Ada Lovelace",
      image: "https://example.com/ada.png",
    });
  });

  it.each([
    ["an unverified email", googleAccount, googleProfile({ email_verified: false })],
    ["a missing email", googleAccount, googleProfile({ email: undefined })],
    ["another provider", { provider: "github" }, googleProfile()],
    ["no account", null, googleProfile()],
    ["no profile", googleAccount, undefined],
  ])("rejects %s", (_label, account, profile) => {
    expect(identityFromProfile(account, profile)).toBeNull();
  });
});

describe("createAuthCallbacks", () => {
  const user = { id: "google-sub", email: "ada@example.com" };

  it("signIn allows verified Google users and refuses the rest", async () => {
    const { signIn } = createAuthCallbacks(createInMemoryUserStore());
    expect(await signIn({ user, account: googleAccount, profile: googleProfile() })).toBe(true);
    expect(
      await signIn({
        user,
        account: googleAccount,
        profile: googleProfile({ email_verified: false }),
      }),
    ).toBe(false);
  });

  it("jwt upserts the user on sign-in and stores our id, not Google's", async () => {
    const store = createInMemoryUserStore();
    const { jwt } = createAuthCallbacks(store);
    const token = await jwt({
      token: { sub: "1234567890", email: "Ada@Example.com" },
      user,
      account: googleAccount,
      profile: googleProfile(),
      trigger: "signIn",
    });

    const saved = store.users.get("ada@example.com");
    expect(saved).toBeDefined();
    expect(token).toMatchObject({
      sub: saved?.id,
      email: "ada@example.com",
      name: "Ada Lovelace",
      picture: "https://example.com/ada.png",
    });
  });

  it("jwt maps repeat sign-ins to the same user", async () => {
    const store = createInMemoryUserStore();
    const { jwt } = createAuthCallbacks(store);
    const signInOnce = () =>
      jwt({ token: {}, user, account: googleAccount, profile: googleProfile(), trigger: "signIn" });

    const [first, second] = [await signInOnce(), await signInOnce()];
    expect(second.sub).toBe(first.sub);
    expect(store.users.size).toBe(1);
  });

  it("jwt passes the token through on ordinary requests without touching the store", async () => {
    const store = createInMemoryUserStore();
    const { jwt } = createAuthCallbacks(store);
    const token: JWT = { sub: "user_1", email: "ada@example.com" };

    expect(await jwt({ token, user, account: null })).toBe(token);
    expect(store.users.size).toBe(0);
  });

  it("jwt refuses an untrusted identity even if signIn was bypassed", async () => {
    const { jwt } = createAuthCallbacks(createInMemoryUserStore());
    await expect(
      jwt({
        token: {},
        user,
        account: googleAccount,
        profile: googleProfile({ email_verified: false }),
      }),
    ).rejects.toThrow(/untrusted identity/);
  });

  it("session exposes our user id and profile", async () => {
    const { session } = createAuthCallbacks(createInMemoryUserStore());
    const base = { expires: "2099-01-01T00:00:00.000Z", user: {} } as Session;
    const result = await session({
      session: base,
      token: { sub: "user_1", email: "ada@example.com", name: "Ada", picture: null },
    } as Parameters<typeof session>[0]);

    expect(result.user).toEqual({
      id: "user_1",
      email: "ada@example.com",
      name: "Ada",
      image: null,
    });
  });

  it("session leaves an incomplete token's session untouched", async () => {
    const { session } = createAuthCallbacks(createInMemoryUserStore());
    const base = { expires: "2099-01-01T00:00:00.000Z", user: {} } as Session;
    const result = await session({ session: base, token: {} } as Parameters<typeof session>[0]);
    expect(result).toBe(base);
  });
});

describe("buildAuthOptions", () => {
  const options = buildAuthOptions(config, createInMemoryUserStore());

  it("uses rolling JWT sessions signed with the configured secret", () => {
    expect(options.secret).toBe(config.secret);
    expect(options.session).toMatchObject({ strategy: "jwt", maxAge: SESSION_MAX_AGE });
  });

  it("configures Google as the only provider", () => {
    expect(options.providers.map((provider) => provider.id)).toEqual(["google"]);
  });

  it("routes sign-in and errors to the custom page", () => {
    expect(options.pages).toEqual({ signIn: SIGN_IN_PATH, error: SIGN_IN_PATH });
  });
});
