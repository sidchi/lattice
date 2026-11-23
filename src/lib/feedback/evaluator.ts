import type { Difficulty, QuestionCategory } from "@/generated/prisma/enums";

import type { Rubric } from "./rubric";

/**
 * The provider-agnostic seam for scoring answers. Anything that can turn (question, answer,
 * rubric) into per-dimension scores implements this: an LLM-backed evaluator over any chat
 * provider, the deterministic offline heuristic, or a test double.
 *
 * Evaluators return *raw* scores only. The overall score and persistence are the feedback
 * service's job, so every evaluator is held to the same validation and the same arithmetic.
 */
export interface AnswerEvaluator {
  /** Stored with the feedback (e.g. "anthropic:claude-sonnet-4-5" or "heuristic-v1"). */
  readonly id: string;
  evaluate(input: EvaluationInput, options?: { signal?: AbortSignal }): Promise<Evaluation>;
}

export type EvaluationInput = {
  question: {
    title: string;
    prompt: string;
    category: QuestionCategory;
    difficulty: Difficulty;
    timeLimitSec: number;
  };
  answer: { content: string; timeSpentSec: number };
  rubric: Rubric;
};

export type DimensionEvaluation = { dimension: string; score: number; comment: string };

export type Evaluation = {
  /** Two or three sentences: the verdict and the single most useful thing to improve. */
  summary: string;
  /** Exactly one entry per rubric dimension. */
  scores: DimensionEvaluation[];
};

/** Thrown when an evaluator cannot produce a valid evaluation (bad output, provider error). */
export class EvaluationError extends Error {
  constructor(
    message: string,
    readonly kind: "invalid_output" | "provider_error" | "timeout",
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "EvaluationError";
  }
}
