import { z } from "zod";

import { type Evaluation, EvaluationError } from "./evaluator";
import { MAX_SCORE, MIN_SCORE, type Rubric } from "./rubric";

/**
 * Validation of evaluator output against the rubric. Model output is untrusted input: it can
 * be malformed JSON, wrapped in prose or code fences, miss a dimension, invent one, or use
 * scores outside the scale. Everything is checked here before anything is stored.
 */

export const MAX_SUMMARY_LENGTH = 1_000;
export const MAX_COMMENT_LENGTH = 600;

const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    // Over-long text is truncated rather than rejected: a verbose but otherwise valid
    // evaluation is still worth keeping.
    .transform((value) => (value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value));

const evaluationSchema = z.object({
  summary: text(MAX_SUMMARY_LENGTH),
  scores: z
    .array(
      z.object({
        dimension: z.string().trim().min(1),
        score: z.number().int().min(MIN_SCORE).max(MAX_SCORE),
        comment: text(MAX_COMMENT_LENGTH),
      }),
    )
    .min(1),
});

/**
 * Pulls the first JSON object out of a model reply. Tolerates the usual wrappers (a ```json
 * fence, a sentence before or after) but not anything that is not a single JSON object.
 */
export function extractJsonObject(reply: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(reply);
  const body = fenced ? fenced[1]! : reply;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new EvaluationError("Reply contains no JSON object", "invalid_output");
  }
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch (cause) {
    throw new EvaluationError("Reply is not valid JSON", "invalid_output", { cause });
  }
}

/**
 * Validates a parsed evaluation against `rubric`: every dimension exactly once, nothing
 * extra, integer scores within the scale. Returns the scores in rubric order.
 */
export function validateEvaluation(value: unknown, rubric: Rubric): Evaluation {
  const parsed = evaluationSchema.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0]!;
    throw new EvaluationError(
      `Invalid evaluation at ${issue.path.join(".") || "(root)"}: ${issue.message}`,
      "invalid_output",
    );
  }

  const byKey = new Map<string, Evaluation["scores"][number]>();
  for (const entry of parsed.data.scores) {
    if (byKey.has(entry.dimension)) {
      throw new EvaluationError(`Duplicate dimension "${entry.dimension}"`, "invalid_output");
    }
    byKey.set(entry.dimension, entry);
  }

  const expected = rubric.dimensions.map((dimension) => dimension.key);
  const unknown = [...byKey.keys()].filter((key) => !expected.includes(key));
  if (unknown.length > 0) {
    throw new EvaluationError(`Unknown dimension(s): ${unknown.join(", ")}`, "invalid_output");
  }
  const missing = expected.filter((key) => !byKey.has(key));
  if (missing.length > 0) {
    throw new EvaluationError(`Missing dimension(s): ${missing.join(", ")}`, "invalid_output");
  }

  return { summary: parsed.data.summary, scores: expected.map((key) => byKey.get(key)!) };
}

/** {@link extractJsonObject} then {@link validateEvaluation}. */
export function parseEvaluationReply(reply: string, rubric: Rubric): Evaluation {
  return validateEvaluation(extractJsonObject(reply), rubric);
}
