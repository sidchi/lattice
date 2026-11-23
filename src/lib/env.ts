import { z } from "zod";

/**
 * Server-side environment schema.
 *
 * Everything is optional so a fresh clone builds and runs with zero configuration: the
 * database defaults to a local SQLite file and sign-in stays off until Google OAuth is
 * configured. Cross-field rules (see {@link parseServerEnv}) reject half-configured setups.
 */
const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1).optional(),
  NEXTAUTH_URL: z.string().url().optional(),
  NEXTAUTH_SECRET: z.string().min(32, "NEXTAUTH_SECRET must be at least 32 characters").optional(),
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  /** Answer feedback (roadmap item 6). Unset means the offline heuristic evaluator. */
  LLM_PROVIDER: z.enum(["anthropic", "openai", "heuristic"]).optional(),
  LLM_API_KEY: z.string().min(1).optional(),
  LLM_MODEL: z.string().min(1).optional(),
  /** Overrides the provider's API base URL (gateways, OpenAI-compatible servers). */
  LLM_BASE_URL: z.string().url().optional(),
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
  const issues: string[] = [];
  const googlePair = [env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET];
  if (googlePair.some(Boolean) && !googlePair.every(Boolean)) {
    issues.push("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set together");
  }
  // Session JWTs are encrypted with NEXTAUTH_SECRET, and middleware must be able to read
  // them. A per-process fallback secret would silently log everyone out on every restart,
  // so turning sign-in on without one is a configuration error.
  if (googlePair.every(Boolean) && !env.NEXTAUTH_SECRET) {
    issues.push("NEXTAUTH_SECRET is required when Google sign-in is configured");
  }
  const remoteLlm = env.LLM_PROVIDER === "anthropic" || env.LLM_PROVIDER === "openai";
  if (remoteLlm && (!env.LLM_API_KEY || !env.LLM_MODEL)) {
    issues.push(
      `LLM_API_KEY and LLM_MODEL are required when LLM_PROVIDER is "${env.LLM_PROVIDER}"`,
    );
  }
  // A key with no provider is almost certainly a typo'd provider name; failing loudly beats
  // silently grading with the heuristic while the operator believes an LLM is in use.
  if (!remoteLlm && (env.LLM_API_KEY || env.LLM_MODEL || env.LLM_BASE_URL)) {
    issues.push(
      'LLM_API_KEY, LLM_MODEL and LLM_BASE_URL need LLM_PROVIDER "anthropic" or "openai"',
    );
  }
  if (issues.length > 0) throw new EnvValidationError(issues);
  return env;
}

/** Google OAuth settings, present only when sign-in is fully configured. */
export type AuthConfig = {
  googleClientId: string;
  googleClientSecret: string;
  secret: string;
};

/**
 * Sign-in is optional so the app runs on a fresh clone. Returns `null` when Google OAuth is
 * not configured; {@link parseServerEnv} has already rejected half-configured setups.
 */
export function getAuthConfig(env: ServerEnv): AuthConfig | null {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, NEXTAUTH_SECRET } = env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !NEXTAUTH_SECRET) return null;
  return {
    googleClientId: GOOGLE_CLIENT_ID,
    googleClientSecret: GOOGLE_CLIENT_SECRET,
    secret: NEXTAUTH_SECRET,
  };
}

/** LLM settings for answer feedback; `null` means the offline heuristic evaluator. */
export type LlmConfig = {
  provider: "anthropic" | "openai";
  apiKey: string;
  model: string;
  baseUrl?: string;
};

export function getLlmConfig(env: ServerEnv): LlmConfig | null {
  const { LLM_PROVIDER, LLM_API_KEY, LLM_MODEL, LLM_BASE_URL } = env;
  if ((LLM_PROVIDER !== "anthropic" && LLM_PROVIDER !== "openai") || !LLM_API_KEY || !LLM_MODEL) {
    return null;
  }
  return {
    provider: LLM_PROVIDER,
    apiKey: LLM_API_KEY,
    model: LLM_MODEL,
    ...(LLM_BASE_URL && { baseUrl: LLM_BASE_URL }),
  };
}

let cached: ServerEnv | undefined;

/** Validated server environment, parsed once per process. */
export function getServerEnv(): ServerEnv {
  cached ??= parseServerEnv(process.env);
  return cached;
}
