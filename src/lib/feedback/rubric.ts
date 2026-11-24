import type { QuestionCategory } from "@/generated/prisma/enums";

/**
 * Scoring rubrics, one per question category.
 *
 * The rubric is the contract between Lattice and whatever evaluates an answer (an LLM or the
 * offline heuristic). It is data, not prompt prose: the same definitions drive the prompt,
 * the validation of the evaluator's output, the overall score and the UI. Dimension keys are
 * persisted in `FeedbackScore.dimension`, so they are stable identifiers; renaming one is a
 * data migration.
 */

/** Scores are integers on a 1-5 scale everywhere (dimensions and overall). */
export const MIN_SCORE = 1;
export const MAX_SCORE = 5;

/** What each point on the scale means. Shared by every rubric so scores are comparable. */
export const SCALE_ANCHORS: Readonly<Record<number, string>> = {
  1: "Missing or incorrect",
  2: "Weak: major gaps",
  3: "Adequate: meets the bar with gaps",
  4: "Strong: minor gaps only",
  5: "Exceptional: what a senior interviewer hopes to hear",
};

export type RubricDimension = {
  /** Stable key, stored in the database. */
  key: string;
  label: string;
  /** What an interviewer looks for. Sent to the evaluator verbatim. */
  criteria: string;
  /** Relative weight in the overall score. */
  weight: number;
};

export type Rubric = {
  category: QuestionCategory;
  /** Bumped whenever criteria or weights change, so stored feedback stays attributable. */
  version: number;
  dimensions: readonly RubricDimension[];
};

const communication: RubricDimension = {
  key: "communication",
  label: "Communication",
  criteria:
    "Structured and easy to follow; states assumptions; leads with the answer and adds detail in a sensible order.",
  weight: 1,
};

export const RUBRICS: Readonly<Record<QuestionCategory, Rubric>> = {
  SYSTEM_DESIGN: {
    category: "SYSTEM_DESIGN",
    version: 1,
    dimensions: [
      {
        key: "requirements",
        label: "Requirements",
        criteria:
          "Clarifies functional and non-functional requirements (scale, latency, consistency, availability) before designing; sizes the problem with rough numbers.",
        weight: 1,
      },
      {
        key: "architecture",
        label: "Architecture",
        criteria:
          "Proposes concrete components, APIs and data model; the data flow for the main use cases is clear and would work.",
        weight: 1.5,
      },
      {
        key: "scalability",
        label: "Scalability & reliability",
        criteria:
          "Identifies bottlenecks and failure modes; addresses partitioning, caching, replication, retries/idempotency and degradation where they matter.",
        weight: 1.5,
      },
      {
        key: "tradeoffs",
        label: "Trade-offs",
        criteria:
          "Names alternatives and explains why one was chosen; is explicit about what the design gives up.",
        weight: 1.5,
      },
      communication,
    ],
  },
  BEHAVIORAL: {
    category: "BEHAVIORAL",
    version: 1,
    dimensions: [
      {
        key: "situation",
        label: "Situation & stakes",
        criteria:
          "Sets up a specific, real situation concisely and makes clear why it mattered and what the candidate owned.",
        weight: 1,
      },
      {
        key: "actions",
        label: "Actions",
        criteria:
          'Describes what the candidate personally did and why ("I", not "we"), including decisions made under ambiguity or disagreement.',
        weight: 1.5,
      },
      {
        key: "impact",
        label: "Impact",
        criteria:
          "States concrete outcomes, ideally measurable, and connects them to the candidate's actions.",
        weight: 1.5,
      },
      {
        key: "reflection",
        label: "Reflection",
        criteria:
          "Shows self-awareness: what they learned, what they would do differently, how it changed their approach.",
        weight: 1,
      },
      communication,
    ],
  },
  CODING: {
    category: "CODING",
    version: 1,
    dimensions: [
      {
        key: "approach",
        label: "Approach",
        criteria:
          "Explains the idea before the code, considers a brute-force baseline and arrives at a suitable algorithm and data structures.",
        weight: 1,
      },
      {
        key: "correctness",
        label: "Correctness",
        criteria: "The solution solves the stated problem, including its constraints.",
        weight: 2,
      },
      {
        key: "complexity",
        label: "Complexity",
        criteria: "States time and space complexity correctly and knows where the cost comes from.",
        weight: 1,
      },
      {
        key: "edge_cases",
        label: "Edge cases & testing",
        criteria:
          "Identifies edge cases (empty input, duplicates, overflow, concurrency where relevant) and says how they would test.",
        weight: 1,
      },
      {
        key: "code_quality",
        label: "Code quality",
        criteria: "Readable, idiomatic code with clear names and sensible decomposition.",
        weight: 1,
      },
      communication,
    ],
  },
};

export function rubricFor(category: QuestionCategory): Rubric {
  return RUBRICS[category];
}

/** Display label for a stored dimension key, falling back to the key for retired dimensions. */
export function dimensionLabel(key: string): string {
  for (const rubric of Object.values(RUBRICS)) {
    const dimension = rubric.dimensions.find((candidate) => candidate.key === key);
    if (dimension) return dimension.label;
  }
  return key;
}

/**
 * Looks up a stored dimension key in the current rubrics. A key can belong to several
 * categories (`communication` is shared by all three). Returns null for retired dimensions.
 */
export function findDimension(
  key: string,
): { dimension: RubricDimension; categories: QuestionCategory[] } | null {
  let found: RubricDimension | undefined;
  const categories: QuestionCategory[] = [];
  for (const rubric of Object.values(RUBRICS)) {
    const dimension = rubric.dimensions.find((candidate) => candidate.key === key);
    if (dimension) {
      found ??= dimension;
      categories.push(rubric.category);
    }
  }
  return found ? { dimension: found, categories } : null;
}

/**
 * Weighted mean of the dimension scores, rounded half up to the nearest integer and clamped
 * to the scale. Computed here rather than asked of the evaluator: models are unreliable at
 * arithmetic, and the overall score must be reproducible from the stored dimension scores.
 */
export function overallScore(rubric: Rubric, scores: Readonly<Record<string, number>>): number {
  let total = 0;
  let weights = 0;
  for (const dimension of rubric.dimensions) {
    const score = scores[dimension.key];
    if (score === undefined) throw new Error(`Missing score for dimension "${dimension.key}"`);
    total += score * dimension.weight;
    weights += dimension.weight;
  }
  // Round to 6 decimals first so 3.4999999 from float error does not round down.
  const mean = Math.round((total / weights) * 1e6) / 1e6;
  return Math.min(MAX_SCORE, Math.max(MIN_SCORE, Math.floor(mean + 0.5)));
}
