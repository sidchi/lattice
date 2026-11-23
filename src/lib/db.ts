import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

import { PrismaClient } from "@/generated/prisma/client";

import { getServerEnv } from "./env";

/** Development fallback, matching prisma.config.ts and .env.example. */
export const DEFAULT_DATABASE_URL = "file:./dev.db";

/**
 * Creates a Prisma client over the better-sqlite3 driver adapter. Prisma 7 has no bundled
 * query engine; the adapter is the database driver. Exported for scripts and tests that
 * need their own client (the seed, in-memory test databases).
 */
export function createPrismaClient(url: string = DEFAULT_DATABASE_URL): PrismaClient {
  return new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) });
}

const globalForPrisma = globalThis as typeof globalThis & { prisma?: PrismaClient };

/**
 * Shared client for the app. Cached on globalThis in development so Next.js hot reloads
 * do not open a new connection on every edit.
 */
export function getPrisma(): PrismaClient {
  if (globalForPrisma.prisma) return globalForPrisma.prisma;
  const env = getServerEnv();
  const client = createPrismaClient(env.DATABASE_URL);
  if (env.NODE_ENV !== "production") globalForPrisma.prisma = client;
  return client;
}
