/** The signed-in user as the rest of the app sees it: our database id, never Google's. */
export type AppUser = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
};

/** What an identity provider tells us about a user at sign-in. */
export type OAuthIdentity = {
  email: string;
  name?: string | null;
  image?: string | null;
};

/**
 * Persistence port for sign-in. Auth code depends on this interface rather than Prisma, so
 * callbacks are unit-tested with an in-memory store and the Prisma adapter is tested
 * separately against a real database.
 */
export interface UserStore {
  /**
   * Creates the user on first sign-in, or refreshes their profile (name, avatar) on later
   * ones. Must be idempotent and keyed on the normalized email.
   */
  upsertFromIdentity(identity: OAuthIdentity): Promise<AppUser>;
}

/** Emails are case-insensitive in practice; store one canonical form. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** In-memory {@link UserStore} for tests and local experiments. */
export function createInMemoryUserStore(): UserStore & { readonly users: Map<string, AppUser> } {
  const users = new Map<string, AppUser>();
  let nextId = 1;
  return {
    users,
    async upsertFromIdentity(identity) {
      const email = normalizeEmail(identity.email);
      const existing = users.get(email);
      const user: AppUser = {
        id: existing?.id ?? `user_${nextId++}`,
        email,
        name: identity.name ?? existing?.name ?? null,
        image: identity.image ?? existing?.image ?? null,
      };
      users.set(email, user);
      return user;
    },
  };
}
