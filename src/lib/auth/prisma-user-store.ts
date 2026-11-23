import type { PrismaClient } from "@/generated/prisma/client";

import { normalizeEmail, type UserStore } from "./users";

const userSelect = { id: true, email: true, name: true, image: true } as const;

/**
 * {@link UserStore} backed by the `User` table. A single `upsert` on the unique email keeps
 * concurrent first sign-ins (two tabs, a retried OAuth callback) from creating duplicates.
 */
export function createPrismaUserStore(prisma: PrismaClient): UserStore {
  return {
    async upsertFromIdentity(identity) {
      const email = normalizeEmail(identity.email);
      // `undefined` leaves a column untouched on update, so a provider that stops sending an
      // avatar does not wipe the one we have.
      const profile = { name: identity.name ?? undefined, image: identity.image ?? undefined };
      return prisma.user.upsert({
        where: { email },
        create: { email, ...profile },
        update: profile,
        select: userSelect,
      });
    },
  };
}
