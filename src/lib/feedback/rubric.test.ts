import { describe, expect, it } from "vitest";

import { QuestionCategory } from "@/generated/prisma/enums";

import {
  dimensionLabel,
  MAX_SCORE,
  MIN_SCORE,
  overallScore,
  RUBRICS,
  rubricFor,
  SCALE_ANCHORS,
} from "./rubric";

const categories = Object.values(QuestionCategory);

describe("RUBRICS", () => {
  it.each(categories)("%s has well-formed dimensions", (category) => {
    const rubric = rubricFor(category);
    expect(rubric.category).toBe(category);
    const keys = rubric.dimensions.map((dimension) => dimension.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const dimension of rubric.dimensions) {
      expect(dimension.key).toMatch(/^[a-z_]+$/);
      expect(dimension.weight).toBeGreaterThan(0);
      expect(dimension.criteria.length).toBeGreaterThan(20);
    }
    expect(keys).toContain("communication");
  });

  it("anchors every point on the scale", () => {
    for (let score = MIN_SCORE; score <= MAX_SCORE; score++)
      expect(SCALE_ANCHORS[score]).toBeTruthy();
  });
});

describe("overallScore", () => {
  const rubric = RUBRICS.CODING; // correctness weighs 2, the other five weigh 1
  const all = (score: number) =>
    Object.fromEntries(rubric.dimensions.map((dimension) => [dimension.key, score]));

  it("is the score itself when every dimension agrees", () => {
    for (let score = MIN_SCORE; score <= MAX_SCORE; score++) {
      expect(overallScore(rubric, all(score))).toBe(score);
    }
  });

  it("weights dimensions", () => {
    // Weighted: (1*2 + 4*5) / 7 = 3.14 → 3. Unweighted it would be (1 + 4*5) / 6 = 3.5 → 4.
    expect(overallScore(rubric, { ...all(4), correctness: 1 })).toBe(3);
    // (5*2 + 1*5) / 7 = 2.14 → 2
    expect(overallScore(rubric, { ...all(1), correctness: 5 })).toBe(2);
  });

  it("rounds half up", () => {
    // Behavioral weights: 1, 1.5, 1.5, 1, 1 (total 6). 3,3,4,4,3 → (3+4.5+6+4+3)/6 = 3.4167 → 3
    const behavioral = RUBRICS.BEHAVIORAL;
    expect(
      overallScore(behavioral, {
        situation: 3,
        actions: 3,
        impact: 4,
        reflection: 4,
        communication: 3,
      }),
    ).toBe(3);
    // 3,4,4,3,3 → (3+6+6+3+3)/6 = 3.5 → 4
    expect(
      overallScore(behavioral, {
        situation: 3,
        actions: 4,
        impact: 4,
        reflection: 3,
        communication: 3,
      }),
    ).toBe(4);
  });

  it("throws on a missing dimension", () => {
    const partial = all(3);
    delete partial.correctness;
    expect(() => overallScore(rubric, partial)).toThrow(/correctness/);
  });
});

describe("dimensionLabel", () => {
  it("labels known keys and falls back to the key for retired ones", () => {
    expect(dimensionLabel("edge_cases")).toBe("Edge cases & testing");
    expect(dimensionLabel("retired_dimension")).toBe("retired_dimension");
  });
});
