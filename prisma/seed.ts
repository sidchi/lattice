/**
 * Seeds the question bank. Run with `npm run db:seed` (or automatically by
 * `prisma migrate reset`). Safe to re-run: see seedQuestionBank.
 */
import { createPrismaClient } from "../src/lib/db";
import { parseServerEnv } from "../src/lib/env";
import { seedQuestionBank } from "../src/lib/seed/seed";

async function main(): Promise<void> {
  const prisma = createPrismaClient(parseServerEnv(process.env).DATABASE_URL);
  try {
    const summary = await seedQuestionBank(prisma);
    process.stdout.write(
      `Seeded ${summary.companies} companies; questions: ${summary.questionsCreated} created, ${summary.questionsUpdated} updated.\n`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
