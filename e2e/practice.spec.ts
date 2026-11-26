import type { Page } from "@playwright/test";

import { signInAs } from "./support/auth";
import { expect, test } from "./support/fixtures";

/**
 * "Sessions completed" on /history. Assertions compare against the count before the test, so
 * a retry (or `--repeat-each`) against the same database still checks the right thing.
 */
async function sessionsCompleted(page: Page): Promise<number> {
  await page.goto("/history");
  const summary = page.getByRole("region", { name: "Summary" });
  const empty = page.getByText(/No submitted sessions yet/);
  await expect(summary.or(empty)).toBeVisible();
  if (await empty.isVisible()) return 0;
  return Number(await summary.getByRole("definition").first().textContent());
}

const TWO_SUM_ANSWER = [
  "Clarify: return the indices of the two numbers that add up to the target; exactly one answer.",
  "Approach: one pass with a hash map from value to index. For each number, check whether",
  "target - number is already in the map; if so return both indices, otherwise store it.",
  "Complexity: O(n) time, O(n) extra space, versus O(n^2) for the brute-force double loop.",
  "Edge cases: duplicates such as [3, 3], negative numbers, and no valid pair. I would test",
  "each of those, plus a large input to check the linear runtime.",
].join("\n");

test("practice a question end to end: answer, save, submit, feedback, history", async ({
  page,
  signIn,
  personas,
  browser,
}) => {
  await signIn("ben");
  const completedBefore = await sessionsCompleted(page);
  let sessionUrl = "";

  await test.step("start from the question bank", async () => {
    await page.goto("/questions/two-sum");
    await page.getByRole("button", { name: "Practice this question" }).click();
    await expect(page).toHaveURL(/\/practice\/[\w-]+$/);
    sessionUrl = page.url();

    await expect(page.getByRole("heading", { level: 1, name: "Mock interview" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Two Sum" })).toBeVisible();
    await expect(page.getByRole("timer", { name: "Time remaining" })).toHaveText(/^\d+:\d{2}$/);
  });

  await test.step("write an answer and save it", async () => {
    await page.getByLabel("Your answer").fill(TWO_SUM_ANSWER);
    await page.getByRole("button", { name: "Save now" }).click();
    await expect(page.getByRole("status")).toHaveText(/^Saved at /);
  });

  await test.step("the saved answer survives a reload", async () => {
    await page.reload();
    await expect(page.getByLabel("Your answer")).toHaveValue(TWO_SUM_ANSWER);
  });

  await test.step("another user cannot open the session", async () => {
    const other = await browser.newContext();
    try {
      await signInAs(other, personas.cy);
      const otherPage = await other.newPage();
      const response = await otherPage.goto(sessionUrl);
      expect(response?.status()).toBe(404);
      await expect(otherPage.getByRole("heading", { name: "Session not found" })).toBeVisible();
    } finally {
      await other.close();
    }
  });

  await test.step("submit, with a confirmation step", async () => {
    await page.getByRole("button", { name: "Submit", exact: true }).click();
    await page.getByRole("button", { name: "Keep working" }).click();
    await expect(page.getByLabel("Your answer")).toBeEditable();

    await page.getByRole("button", { name: "Submit", exact: true }).click();
    await page.getByRole("button", { name: "Yes, submit" }).click();

    await expect(page.getByRole("heading", { level: 1, name: "Session submitted" })).toBeVisible();
    await expect(
      page.getByText("Approach: one pass with a hash map", { exact: false }),
    ).toBeVisible();
    await expect(page.getByText("No feedback yet.")).toBeVisible();
  });

  await test.step("get rubric feedback", async () => {
    await page.getByRole("button", { name: "Get feedback" }).click();

    const feedback = page.getByRole("region", { name: "Feedback" });
    await expect(feedback).toBeVisible();
    await expect(feedback.getByText(/^Overall [1-5]\/5/)).toBeVisible();
    await expect(feedback.getByText("Offline heuristic (keyword coverage)")).toBeVisible();
    // The coding rubric has six dimensions, each scored 1-5.
    const dimensions = [
      "Approach",
      "Correctness",
      "Complexity",
      "Edge cases & testing",
      "Code quality",
      "Communication",
    ];
    for (const label of dimensions) {
      await expect(feedback.getByRole("term").filter({ hasText: label })).toHaveText(
        new RegExp(`^${label}[1-5]/5$`),
      );
    }
    await expect(page.getByRole("button", { name: "Regenerate feedback" })).toBeVisible();
  });

  await test.step("the result shows up in history and on the dashboard", async () => {
    expect(await sessionsCompleted(page)).toBe(completedBefore + 1);
    await expect(page.getByRole("img", { name: /^Average score per session/ })).toBeVisible();

    // Newest first, so this session is the first row, linked and scored.
    const pastSessions = page.getByRole("region", { name: "Past sessions" });
    const row = pastSessions.getByRole("listitem").first();
    await expect(row.getByRole("link", { name: "Two Sum" })).toHaveAttribute(
      "href",
      new URL(sessionUrl).pathname,
    );
    await expect(row.getByText(/^[1-5]\.\d \/ 5$/)).toBeVisible();

    await page.goto("/dashboard");
    const progress = page.getByRole("region", { name: "Your progress" });
    await expect(progress.getByRole("definition").first()).toHaveText(String(completedBefore + 1));
  });
});

test("a multi-question session keeps each answer when switching questions", async ({
  page,
  signIn,
}) => {
  await signIn("cy");
  await page.goto("/practice");
  await page.getByLabel("Category").selectOption({ label: "Behavioral" });
  await page.getByLabel("Questions").selectOption("2");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page).toHaveURL(/\/practice\/[\w-]+$/);

  const questions = page.getByRole("navigation", { name: "Questions" });
  await expect(questions.getByRole("button")).toHaveCount(2);
  const first = await page.getByRole("heading", { level: 2 }).textContent();

  await page
    .getByLabel("Your answer")
    .fill("Situation: a launch slipped. Action: I re-planned it.");
  await questions.getByRole("button", { name: /^Question 2/ }).click();
  await expect(page.getByRole("heading", { level: 2 })).not.toHaveText(first ?? "");
  await expect(page.getByLabel("Your answer")).toHaveValue("");
  // Switching questions saves, and the first one is now announced as answered.
  await expect(page.getByRole("status")).toHaveText(/^Saved at /);
  await expect(questions.getByRole("button", { name: "Question 1 (answered)" })).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Your answer")).toHaveValue(
    "Situation: a launch slipped. Action: I re-planned it.",
  );
});

test("a brand-new user sees empty states, not errors", async ({ page, signIn }) => {
  await signIn("eve");
  await page.goto("/history");
  await expect(page.getByText(/No submitted sessions yet/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Start practicing" })).toHaveAttribute(
    "href",
    "/practice",
  );

  await page.goto("/practice");
  await expect(page.getByText("No sessions yet.")).toBeVisible();

  await page.goto("/dashboard");
  await expect(page.getByRole("region", { name: "Your progress" })).toHaveCount(0);
});
