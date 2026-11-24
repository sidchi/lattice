import { describe, expect, it } from "vitest";

import { isProtectedPath } from "@/lib/auth/paths";

import { feedbackStatusMessage, PRACTICE_PATH, practiceHref, startErrorMessage } from "./paths";

describe("practice paths", () => {
  it("builds session URLs under the protected /practice prefix", () => {
    expect(practiceHref("cm123")).toBe("/practice/cm123");
    expect(isProtectedPath(PRACTICE_PATH)).toBe(true);
    expect(isProtectedPath(practiceHref("cm123"))).toBe(true);
  });

  it("encodes ids, so a crafted id cannot change the path", () => {
    expect(practiceHref("../admin")).toBe("/practice/..%2Fadmin");
  });
});

describe("startErrorMessage", () => {
  it("maps known codes", () => {
    expect(startErrorMessage("no_questions")).toMatch(/No questions match/);
    expect(startErrorMessage(["invalid", "no_questions"])).toMatch(/wasn't valid/);
  });

  it("ignores unknown codes, including prototype keys", () => {
    expect(startErrorMessage(undefined)).toBeNull();
    expect(startErrorMessage("")).toBeNull();
    expect(startErrorMessage("<script>")).toBeNull();
    expect(startErrorMessage("constructor")).toBeNull();
  });
});

describe("feedbackStatusMessage", () => {
  it("maps known codes and ignores everything else", () => {
    expect(feedbackStatusMessage("partial")).toMatch(/some answers/);
    expect(feedbackStatusMessage(["failed"])).toMatch(/Try again in a moment/);
    expect(feedbackStatusMessage("not_submitted")).toMatch(/once the session is submitted/);
    expect(feedbackStatusMessage(undefined)).toBeNull();
    expect(feedbackStatusMessage("toString")).toBeNull();
  });
});
