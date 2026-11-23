import { z } from "zod";

/**
 * Server-side environment schema.
 *
 * Variables needed by later roadmap items (database, auth) are optional for now so the
 * scaffold builds and runs with zero configuration. They are tightened as each feature
 * lands, which keeps "works on a fresh clone" true at every step.
 */
const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1).optional(),
  NEXTAUTH_URL: z.string().url().optional(),
  NEXTAUTH_SECRET: z.string().min(32, "NEXTAUTH_SECRET must be at least 32 characters").optional(),
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export class EnvValidationError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(`Invalid environment configuration:\n  - ${issues.join("\n  - ")}`);
    this.name = "EnvValidationError";
  }
}

/** Empty strings in .env files mean "unset", not "set to empty". */
function dropEmpty(source: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(source).filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
}

/**
 * Parses and validates an environment record. Pure, so it is trivially testable;
 * callers normally use {@link getServerEnv}.
 */
export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = serverEnvSchema.safeParse(dropEmpty(source));
  if (!result.success) {
    throw new EnvValidationError(
      result.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`),
    );
  }

  const env = result.data;
  const googlePair = [env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET];
  if (googlePair.some(Boolean) && !googlePair.every(Boolean)) {
    throw new EnvValidationError([
      "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set together",
    ]);
  }
  return env;
}

let cached: ServerEnv | undefined;

/** Validated server environment, parsed once per process. */
export function getServerEnv(): ServerEnv {
  cached ??= parseServerEnv(process.env);
  return cached;
}
