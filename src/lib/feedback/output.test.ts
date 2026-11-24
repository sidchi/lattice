import { describe, expect, it } from "vitest";

import { evaluationFor } from "@/test/feedback";

import { EvaluationError } from "./evaluator";
import {
  extractJsonObject,
  MAX_COMMENT_LENGTH,
  parseEvaluationReply,
  validateEvaluation,
} from "./output";
import { RUBRICS } from "./rubric";

const rubric = RUBRICS.SYSTEM_DESIGN;
const valid = evaluationFor("SYSTEM_DESIGN", 4);

function invalidOutput(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(EvaluationError);
    expect((error as EvaluationError).kind).toBe("invalid_output");
    return (error as Error).message;
  }
  throw new Error("expected an EvaluationError");
}

describe("extractJsonObject", () => {
  it.each([
    ["bare JSON", '{"a":1}'],
    ["a json fence", 'Here you go:\n```json\n{"a":1}\n```'],
    ["a plain fence", '```\n{"a":1}\n```'],
    ["surrounding prose", 'Sure! {"a":1} Hope that helps.'],
  ])("reads %s", (_name, reply) => {
    expect(extractJsonObject(reply)).toEqual({ a: 1 });
  });

  it("rejects replies without a JSON object", () => {
    expect(invalidOutput(() => extractJsonObject("I cannot grade this."))).toMatch(/no JSON/);
    expect(invalidOutput(() => extractJsonObject("{not: json}"))).toMatch(/not valid JSON/);
  });
});

describe("validateEvaluation", () => {
  it("accepts a valid evaluation and returns scores in rubric order", () => {
    const shuffled = { ...valid, scores: [...valid.scores].reverse() };
    const result = validateEvaluation(shuffled, rubric);
    expect(result.scores.map((score) => score.dimension)).toEqual(
      rubric.dimensions.map((dimension) => dimension.key),
    );
  });

  it("trims and truncates long text instead of rejecting it", () => {
    const long = "x".repeat(MAX_COMMENT_LENGTH + 50);
    const result = validateEvaluation(
      {
        summary: "  Fine.  ",
        scores: valid.scores.map((score) => ({ ...score, comment: long })),
      },
      rubric,
    );
    expect(result.summary).toBe("Fine.");
    expect(result.scores[0]!.comment).toHaveLength(MAX_COMMENT_LENGTH);
    expect(result.scores[0]!.comment.endsWith("…")).toBe(true);
  });

  const withScore = (patch: Record<string, unknown>) => ({
    ...valid,
    scores: valid.scores.map((score, index) => (index === 0 ? { ...score, ...patch } : score)),
  });

  it.each([
    ["a score above the scale", withScore({ score: 6 }), /scores\.0\.score/],
    ["a score below the scale", withScore({ score: 0 }), /scores\.0\.score/],
    ["a fractional score", withScore({ score: 3.5 }), /scores\.0\.score/],
    ["a string score", withScore({ score: "4" }), /scores\.0\.score/],
    ["an empty comment", withScore({ comment: " " }), /scores\.0\.comment/],
    ["a missing summary", { scores: valid.scores }, /summary/],
    ["no scores", { summary: "x", scores: [] }, /scores/],
    ["a non-object", ["nope"], /root/],
  ])("rejects %s", (_name, value, message) => {
    expect(invalidOutput(() => validateEvaluation(value, rubric))).toMatch(message);
  });

  it("rejects missing, unknown and duplicate dimensions", () => {
    expect(
      invalidOutput(() => validateEvaluation({ ...valid, scores: valid.scores.slice(1) }, rubric)),
    ).toMatch(/Missing dimension\(s\): requirements/);
    expect(
      invalidOutput(() =>
        validateEvaluation(
          { ...valid, scores: [...valid.scores, { dimension: "vibes", score: 5, comment: "!" }] },
          rubric,
        ),
      ),
    ).toMatch(/Unknown dimension\(s\): vibes/);
    expect(
      invalidOutput(() =>
        validateEvaluation({ ...valid, scores: [...valid.scores, valid.scores[0]] }, rubric),
      ),
    ).toMatch(/Duplicate dimension "requirements"/);
  });

  it("rejects an evaluation written for another category's rubric", () => {
    expect(invalidOutput(() => validateEvaluation(evaluationFor("CODING"), rubric))).toMatch(
      /Unknown dimension/,
    );
  });
});

describe("parseEvaluationReply", () => {
  it("extracts and validates in one step", () => {
    const reply = "```json\n" + JSON.stringify(valid) + "\n```";
    expect(parseEvaluationReply(reply, rubric)).toEqual(valid);
  });
});
