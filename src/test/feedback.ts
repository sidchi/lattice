import type { Evaluation, EvaluationInput } from "@/lib/feedback/evaluator";
import { rubricFor } from "@/lib/feedback/rubric";

/** A valid evaluation for `category`'s rubric with every dimension at `score`. */
export function evaluationFor(
  category: EvaluationInput["question"]["category"],
  score = 3,
  summary = "Solid answer; quantify the scale.",
): Evaluation {
  return {
    summary,
    scores: rubricFor(category).dimensions.map((dimension) => ({
      dimension: dimension.key,
      score,
      comment: `Comment on ${dimension.key}.`,
    })),
  };
}

export function evaluationInput(
  content = "Use a token bucket per client, stored in Redis.",
  category: EvaluationInput["question"]["category"] = "SYSTEM_DESIGN",
): EvaluationInput {
  return {
    question: {
      title: "Design a distributed rate limiter",
      prompt: "Design a rate limiter for a public API serving many clients.",
      category,
      difficulty: "MEDIUM",
      timeLimitSec: 45 * 60,
    },
    answer: { content, timeSpentSec: 600 },
    rubric: rubricFor(category),
  };
}
