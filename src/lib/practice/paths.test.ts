import { describe, expect, it } from "vitest";

import { isProtectedPath } from "@/lib/auth/paths";

import { PRACTICE_PATH, practiceHref, startErrorMessage } from "./paths";

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
