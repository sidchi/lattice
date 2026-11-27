import { readFileSync } from "node:fs";

import { E2E_PERSONAS_FILE } from "./env";

/**
 * Test users. Each spec signs in as its own persona so specs can run in parallel against one
 * database without seeing each other's sessions. All emails use the reserved `.test` TLD.
 */
export const personas = {
  /** Signs in and out; never practices. */
  ada: { email: "ada@lattice.test", name: "Ada Example" },
  /** Runs the full practice → submit → feedback → history journey. */
  ben: { email: "ben@lattice.test", name: "Ben Example" },
  /** A second user, for checking that sessions are private. */
  cy: { email: "cy@lattice.test", name: "Cy Example" },
  /** Accessibility scans of signed-in pages, with practice data of its own. */
  dee: { email: "dee@lattice.test", name: "Dee Example" },
  /** Has never practiced: empty states. */
  eve: { email: "eve@lattice.test", name: "Eve Example" },
} as const;

export type PersonaName = keyof typeof personas;

export type ProvisionedPersona = { id: string; email: string; name: string };

/** Persona ids written by `e2e/prepare.ts`, keyed by persona name. */
export function readProvisionedPersonas(): Record<PersonaName, ProvisionedPersona> {
  return JSON.parse(readFileSync(E2E_PERSONAS_FILE, "utf8")) as Record<
    PersonaName,
    ProvisionedPersona
  >;
}
