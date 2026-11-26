/**
 * Builds a fresh database for the end-to-end suite: applies the committed migrations, loads
 * the real question bank, and provisions the test personas.
 *
 * Playwright runs this before starting the app server (see `webServer` in
 * playwright.config.ts), so every run starts from the same state. Run it by hand with
 * `npm run e2e:prepare`.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";

import Database from "better-sqlite3";

import { createPrismaUserStore } from "../src/lib/auth/prisma-user-store";
import { createPrismaClient } from "../src/lib/db";
import { seedQuestionBank } from "../src/lib/seed/seed";
import { readMigrations } from "../src/test/db";

import { E2E_DATABASE_FILE, E2E_PERSONAS_FILE, E2E_STATE_DIR } from "./support/env";
import { type PersonaName, personas, type ProvisionedPersona } from "./support/personas";

async function main(): Promise<void> {
  // The path is fixed by e2e/support/env.ts, so this can only ever delete the E2E database.
  rmSync(E2E_STATE_DIR, { recursive: true, force: true });
  mkdirSync(E2E_STATE_DIR, { recursive: true });

  // Same SQL, same order as `prisma migrate deploy`. Applied directly so the suite needs no
  // Prisma schema-engine binary; CI separately checks that `migrate deploy` matches the schema.
  const raw = new Database(E2E_DATABASE_FILE);
  try {
    for (const sql of readMigrations()) raw.exec(sql);
  } finally {
    raw.close();
  }

  const prisma = createPrismaClient(`file:${E2E_DATABASE_FILE}`);
  try {
    const seeded = await seedQuestionBank(prisma);

    // Provision users through the same store the OAuth `jwt` callback uses on first sign-in,
    // so the rows look exactly like a real Google sign-in created them.
    const users = createPrismaUserStore(prisma);
    const provisioned = {} as Record<PersonaName, ProvisionedPersona>;
    for (const [key, persona] of Object.entries(personas) as [
      PersonaName,
      (typeof personas)[PersonaName],
    ][]) {
      const user = await users.upsertFromIdentity({ ...persona, image: null });
      provisioned[key] = { id: user.id, email: user.email, name: persona.name };
    }
    writeFileSync(E2E_PERSONAS_FILE, `${JSON.stringify(provisioned, null, 2)}\n`);

    process.stdout.write(
      `E2E database ready: ${seeded.questionsCreated} questions, ${Object.keys(provisioned).length} personas.\n`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
