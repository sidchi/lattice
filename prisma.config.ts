import { existsSync } from "node:fs";

import { defineConfig } from "prisma/config";

// The Prisma CLI does not read .env files on its own (Prisma 7). Load the same files
// Next.js does, most specific first; variables already set in the shell win.
for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? "file:./dev.db",
  },
});
