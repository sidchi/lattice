import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import Database from "better-sqlite3";

import type { PrismaClient } from "@/generated/prisma/client";
import { createPrismaClient } from "@/lib/db";

const MIGRATIONS_DIR = path.resolve(__dirname, "../../prisma/migrations");

/** Every committed migration, oldest first, exactly as `prisma migrate deploy` applies them. */
export function readMigrations(): string[] {
  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .map((name) => readFileSync(path.join(MIGRATIONS_DIR, name, "migration.sql"), "utf8"));
}

export type TestDatabase = {
  prisma: PrismaClient;
  /** Disconnects and deletes the database file. */
  dispose: () => Promise<void>;
};

/**
 * A throwaway SQLite database with the committed migrations applied, so tests exercise the
 * real schema (constraints, cascades, indexes) rather than a mock. Each call is isolated.
 */
export function createTestDatabase(): TestDatabase {
  const dir = mkdtempSync(path.join(tmpdir(), "lattice-test-"));
  const file = path.join(dir, "test.db");

  const raw = new Database(file);
  try {
    for (const sql of readMigrations()) raw.exec(sql);
  } finally {
    raw.close();
  }

  const prisma = createPrismaClient(`file:${file}`);
  return {
    prisma,
    dispose: async () => {
      await prisma.$disconnect();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
