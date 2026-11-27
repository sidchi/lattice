/**
 * Environment for the end-to-end suite: one place that both `playwright.config.ts` (which
 * passes it to the app server) and the fixtures (which mint session cookies) read from.
 *
 * Every value here is a throwaway test value. The Google client id/secret are never sent to
 * Google: the suite intercepts the OAuth redirect before it leaves the browser.
 */
import path from "node:path";

export const E2E_PORT = Number(process.env.E2E_PORT ?? 3100);
export const E2E_BASE_URL = `http://localhost:${E2E_PORT}`;

/** Scratch directory for the database and persona ids. Git-ignored. */
export const E2E_STATE_DIR = path.resolve(__dirname, "../.state");
export const E2E_DATABASE_FILE = path.join(E2E_STATE_DIR, "e2e.db");
export const E2E_PERSONAS_FILE = path.join(E2E_STATE_DIR, "personas.json");

/** Encrypts session cookies. Must match between the app server and the cookie fixture. */
export const E2E_NEXTAUTH_SECRET = "e2e-only-secret-not-used-anywhere-else-0123456789";
export const E2E_GOOGLE_CLIENT_ID = "e2e-client-id.apps.googleusercontent.com";

/**
 * Server environment for `next build` and `next start` under test. Sign-in is configured (so
 * the real NextAuth routes and middleware run), and the LLM settings are cleared so feedback
 * uses the deterministic offline evaluator.
 */
export const e2eServerEnv: Record<string, string> = {
  DATABASE_URL: `file:${E2E_DATABASE_FILE}`,
  NEXTAUTH_URL: E2E_BASE_URL,
  NEXTAUTH_SECRET: E2E_NEXTAUTH_SECRET,
  GOOGLE_CLIENT_ID: E2E_GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: "e2e-client-secret",
  LLM_PROVIDER: "",
  LLM_API_KEY: "",
  LLM_MODEL: "",
  LLM_BASE_URL: "",
  NEXT_TELEMETRY_DISABLED: "1",
};
