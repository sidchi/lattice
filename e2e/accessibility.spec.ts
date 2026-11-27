import type { Page } from "@playwright/test";

import { expect, test } from "./support/fixtures";

/**
 * Automated WCAG 2.1/2.2 AA checks (axe-core) on every page, in light and dark mode, plus the
 * keyboard behavior axe can't see. Automated checks catch roughly a third to a half of real
 * issues; the README lists what was checked by hand.
 */

const colorSchemes = ["light", "dark"] as const;

const publicPages = [
  { name: "home", path: "/" },
  { name: "question bank", path: "/questions" },
  { name: "filtered question bank", path: "/questions?category=coding&difficulty=easy" },
  { name: "question detail", path: "/questions/two-sum" },
  { name: "sign in", path: "/signin" },
  { name: "sign-in error", path: "/signin?error=AccessDenied" },
  { name: "unknown question", path: "/questions/does-not-exist" },
];

async function startSession(page: Page, slug: string): Promise<string> {
  await page.goto(`/questions/${slug}`);
  await page.getByRole("button", { name: "Practice this question" }).click();
  await expect(page.getByRole("timer")).toBeVisible();
  return page.url();
}

for (const colorScheme of colorSchemes) {
  test.describe(`${colorScheme} mode`, () => {
    test.use({ colorScheme });

    for (const { name, path } of publicPages) {
      test(`${name} has no WCAG violations`, async ({ page, expectAccessible }) => {
        await page.goto(path);
        await expectAccessible(page);
      });
    }

    test("signed-in pages have no WCAG violations", async ({ page, signIn, expectAccessible }) => {
      // Both color-scheme variants of this test use the same persona and may run in
      // parallel, so assertions only rely on this test's own session.
      await signIn("dee");

      await page.goto("/dashboard");
      await expectAccessible(page);

      await page.goto("/history"); // Empty state on the first run, populated on the second.
      await expectAccessible(page);

      await startSession(page, "valid-parentheses");
      await page.getByLabel("Your answer").fill("Use a stack; push openers, pop on closers.");
      await expectAccessible(page);

      await page.getByRole("button", { name: "Submit", exact: true }).click();
      await expectAccessible(page); // Confirmation step.
      await page.getByRole("button", { name: "Yes, submit" }).click();
      await expect(page.getByRole("heading", { name: "Session submitted" })).toBeVisible();
      await expectAccessible(page);

      await page.getByRole("button", { name: "Get feedback" }).click();
      await expect(page.getByRole("region", { name: "Feedback" })).toBeVisible();
      await expectAccessible(page);

      await page.goto("/practice");
      await expectAccessible(page);

      await page.goto("/history");
      await expect(page.getByRole("region", { name: "Past sessions" })).toBeVisible();
      await expectAccessible(page);
    });
  });
}

test.describe("keyboard", () => {
  test("the first Tab stop is a skip link to the main content", async ({ page }) => {
    await page.goto("/questions");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to main content" });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();

    await page.keyboard.press("Enter");
    await expect(page.locator("main")).toBeFocused();
  });

  test("focus is visible on interactive elements", async ({ page }) => {
    await page.goto("/");
    // Tab past the skip link to the first link in the page.
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    const focused = page.locator(":focus");
    await expect(focused).toHaveCount(1);
    const outline = await focused.evaluate((el) => {
      const style = getComputedStyle(el);
      return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
    });
    expect(outline.style).not.toBe("none");
    expect(outline.width).toBeGreaterThanOrEqual(2);
  });

  test("a practice session can be completed with the keyboard alone", async ({ page, signIn }) => {
    await signIn("cy");
    await startSession(page, "merge-intervals");

    await page.getByLabel("Your answer").focus();
    await page.keyboard.type("Sort by start, then merge overlapping intervals in one pass.");

    // Tab from the editor to Save now, then Submit.
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Save now" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("status")).toHaveText(/^Saved at /);

    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Submit", exact: true })).toBeFocused();
    await page.keyboard.press("Enter");

    // The confirmation takes focus, so Enter confirms without hunting for the button.
    await expect(page.getByRole("button", { name: "Yes, submit" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "Session submitted" })).toBeVisible();
  });
});
