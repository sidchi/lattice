import { describe, expect, it } from "vitest";

import { historyHref, parseHistoryParams } from "./paths";

const known = ["anthropic:model-a", "heuristic-v1"];

describe("parseHistoryParams", () => {
  it("defaults to the first page and every evaluator", () => {
    expect(parseHistoryParams({}, known)).toEqual({ page: 1 });
  });

  it("reads a page and a known evaluator", () => {
    expect(parseHistoryParams({ page: "3", scoredBy: "heuristic-v1" }, known)).toEqual({
      page: 3,
      evaluator: "heuristic-v1",
    });
  });

  it("ignores malformed pages and unknown evaluators", () => {
    for (const page of ["0", "-1", "1.5", "abc", "9999999", ""]) {
      expect(parseHistoryParams({ page }, known).page).toBe(1);
    }
    expect(parseHistoryParams({ scoredBy: "<script>" }, known)).toEqual({ page: 1 });
  });

  it("takes the first value of repeated parameters", () => {
    expect(
      parseHistoryParams({ page: ["2", "5"], scoredBy: ["heuristic-v1", "x"] }, known),
    ).toEqual({ page: 2, evaluator: "heuristic-v1" });
  });
});

describe("historyHref", () => {
  it("omits defaults", () => {
    expect(historyHref()).toBe("/history");
    expect(historyHref({ page: 1 })).toBe("/history");
  });

  it("encodes the evaluator and page, and round-trips through the parser", () => {
    const href = historyHref({ page: 2, evaluator: "anthropic:model-a" });
    expect(href).toBe("/history?scoredBy=anthropic%3Amodel-a&page=2");
    const params = Object.fromEntries(new URL(href, "http://x").searchParams);
    expect(parseHistoryParams(params, known)).toEqual({ page: 2, evaluator: "anthropic:model-a" });
  });
});
