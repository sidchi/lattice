import { getServerSession, type NextAuthOptions } from "next-auth";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { buildAuthOptions } from "@/lib/auth/options";
import { signInUrl } from "@/lib/auth/paths";
import { createPrismaUserStore } from "@/lib/auth/prisma-user-store";
import { getPrisma } from "@/lib/db";
import { getAuthConfig, getServerEnv } from "@/lib/env";

/** The signed-in user, as exposed by the session callback. */
export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
};

let cached: NextAuthOptions | null | undefined;

/**
 * NextAuth options for this deployment, or `null` when sign-in is not configured. Built on
 * first use rather than at import time so `next build` never needs OAuth secrets.
 */
export function getAuthOptions(): NextAuthOptions | null {
  if (cached === undefined) {
    const config = getAuthConfig(getServerEnv());
    cached = config ? buildAuthOptions(config, createPrismaUserStore(getPrisma())) : null;
  }
  return cached;
}

/** True when Google sign-in is configured for this deployment. */
export function isAuthEnabled(): boolean {
  return getAuthOptions() !== null;
}

/** The current user in a server component, route handler or server action, or `null`. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  // Opt the caller into dynamic rendering even when auth is off. Otherwise `next build` would
  // prerender "signed out" (and its redirect) into a static page.
  await connection();
  const options = getAuthOptions();
  if (!options) return null;
  const session = await getServerSession(options);
  const user = session?.user;
  if (!user?.id) return null;
  return { id: user.id, email: user.email, name: user.name ?? null, image: user.image ?? null };
}

/**
 * The current user, or a redirect to sign-in that returns to `returnTo`. This is the real
 * authorization check for protected pages; middleware only provides the early redirect.
 */
export async function requireUser(returnTo: string): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect(signInUrl(returnTo));
  return user;
}
