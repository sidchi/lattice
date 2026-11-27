import AxeBuilder from "@axe-core/playwright";
import { test as base, expect, type Page } from "@playwright/test";

import { MAIN_CONTENT_ID } from "../../src/components/layout/skip-link";

import { signInAs } from "./auth";
import { type PersonaName, type ProvisionedPersona, readProvisionedPersonas } from "./personas";

/** The WCAG levels Lattice targets: 2.1 A and AA (the 2.2 AA additions are checked too). */
export const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

type Fixtures = {
  /** Signs the page's browser context in as a persona and returns the persona. */
  signIn: (name: PersonaName) => Promise<ProvisionedPersona>;
  /** Runs axe on the page and fails with a readable list of WCAG violations. */
  expectAccessible: (page: Page) => Promise<void>;
};

type WorkerFixtures = { personas: Record<PersonaName, ProvisionedPersona> };

export const test = base.extend<Fixtures, WorkerFixtures>({
  personas: [
    async ({}, use) => {
      await use(readProvisionedPersonas());
    },
    { scope: "worker" },
  ],

  signIn: async ({ context, personas }, use) => {
    await use(async (name) => {
      await signInAs(context, personas[name]);
      return personas[name];
    });
  },

  expectAccessible: async ({}, use, testInfo) => {
    await use(async (page) => {
      // Next.js streams metadata, so after a client-side navigation the <title> can land a
      // moment after the content. Wait for it (this also fails if a page has no title).
      await expect(page).toHaveTitle(/\S/);
      // Every page must expose the skip link's target.
      await expect(page.locator(`main#${MAIN_CONTENT_ID}`)).toHaveCount(1);

      const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();

      // Keep the raw report with the test results for debugging.
      await testInfo.attach(`axe ${new URL(page.url()).pathname}`, {
        body: JSON.stringify(results.violations, null, 2),
        contentType: "application/json",
      });

      const summary = results.violations.map(
        (violation) =>
          `${violation.id} (${violation.impact}): ${violation.help}\n` +
          violation.nodes.map((node) => `    ${node.target.join(" ")}`).join("\n"),
      );
      expect(summary, `WCAG violations on ${page.url()}`).toEqual([]);
    });
  },
});

export { expect };
