import type {
  AnswerEvaluator,
  DimensionEvaluation,
  Evaluation,
  EvaluationInput,
} from "./evaluator";
import { MAX_SCORE, MIN_SCORE, type RubricDimension } from "./rubric";

/**
 * Offline, deterministic evaluator. It is what runs when no LLM provider is configured, so a
 * fresh clone (and the demo mode on the roadmap) still produces feedback end to end.
 *
 * It does not understand answers. It scores *coverage*: whether an answer is substantial and
 * uses the vocabulary each rubric dimension calls for (a system-design answer that never
 * mentions a cache, a queue, replication or a trade-off is very likely missing those ideas).
 * The UI labels its output as a heuristic so nobody mistakes it for a real review.
 */

export const HEURISTIC_EVALUATOR_ID = "heuristic-v1";

/** Words per answer that count as "substantial", per category. */
const SUBSTANTIAL_WORDS = { SYSTEM_DESIGN: 250, BEHAVIORAL: 180, CODING: 120 } as const;

/** Signals per dimension key. Each pattern that matches is one piece of evidence. */
const SIGNALS: Readonly<Record<string, readonly RegExp[]>> = {
  // System design
  requirements: [
    /\brequirements?\b/i,
    /\b(qps|rps|tps|requests? per second|throughput)\b/i,
    /\b(latency|p9[59]|sla|slo)\b/i,
    /\b\d+(\.\d+)?\s?(k|m|b|million|billion|gb|tb|pb)\b/i,
    /\b(assum(e|ption)|out of scope|non-functional)\b/i,
  ],
  architecture: [
    /\b(api|endpoint|rest|grpc)\b/i,
    /\b(database|db|table|schema|postgres|dynamo|cassandra)\b/i,
    /\b(service|worker|gateway|load balancer)\b/i,
    /\b(queue|kafka|stream|pub\/?sub|event)\b/i,
    /\b(cache|redis|cdn)\b/i,
  ],
  scalability: [
    /\b(shard|partition)/i,
    /\b(replica|replication|failover|multi-region)\b/i,
    /\b(retr(y|ies)|backoff|idempoten)/i,
    /\b(rate limit|backpressure|circuit breaker|degrad)/i,
    /\b(horizontal(ly)? scal|autoscal|bottleneck|hot (key|spot))/i,
  ],
  tradeoffs: [
    /\btrade-?offs?\b/i,
    /\b(alternative|instead of|rather than|versus|vs\.?)\b/i,
    /\b(consistency|availability|cap theorem|eventual)\b/i,
    /\b(downside|cost|give up|at the expense)\b/i,
  ],
  // Behavioral
  situation: [
    /\b(when i was|at my (last|previous)|our team|the project|we were)\b/i,
    /\b(deadline|launch|incident|outage|customer|stakeholder)\b/i,
    /\b(responsible|owned|my role|i led)\b/i,
  ],
  actions: [
    /\bi (decided|proposed|built|wrote|led|talked|pushed|drove|negotiated|designed|organized)\b/i,
    /\b(because|so that|in order to)\b/i,
    /\b(disagree|convinced|aligned|escalat)/i,
  ],
  impact: [
    /\b\d+(\.\d+)?\s?(%|percent|x\b|ms\b|hours?|days?|weeks?)/i,
    /\b(result(ed)?|outcome|impact|reduced|increased|improved|saved|shipped)\b/i,
    /\$\s?\d/,
  ],
  reflection: [
    /\b(learn(ed|t)|lesson|in hindsight|differently|next time|retrospective)\b/i,
    /\b(mistake|i should have|would have)\b/i,
  ],
  // Coding
  approach: [
    /\b(brute[- ]force|naive)\b/i,
    /\b(hash ?map|dictionary|set|heap|stack|queue|two pointers?|sliding window|binary search|dfs|bfs|dynamic programming|dp|graph|tree|trie)\b/i,
    /\b(idea|approach|intuition|observe)\b/i,
  ],
  correctness: [
    /\b(def|function|return|for|while|if)\b/,
    /[{}()[\]]/,
    /\b(invariant|correct|proof|works because)\b/i,
  ],
  complexity: [
    /\bO\([^)]+\)/,
    /\b(time|space) complexity\b/i,
    /\b(linear|logarithmic|quadratic)\b/i,
  ],
  edge_cases: [
    /\bedge cases?\b/i,
    /\b(empty|null|none|zero|negative|duplicate|overflow)\b/i,
    /\b(test|assert)\w*\b/i,
  ],
  code_quality: [
    /\b(helper|refactor|readab|naming|modular)\w*/i,
    /\n\s{2,}\S/,
    /\b(const|let|val|var|def)\b/,
  ],
  // Shared
  communication: [
    /^\s*([-*•]|\d+[.)])\s/m,
    /^\s*#+\s|\n\s*\n/m,
    /\b(first|then|next|finally|in summary|to summarize)\b/i,
  ],
};

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function scoreDimension(
  dimension: RubricDimension,
  text: string,
  lengthPoints: number,
): DimensionEvaluation {
  const signals = SIGNALS[dimension.key] ?? [];
  const hits = signals.filter((pattern) => pattern.test(text)).length;
  const evidence = Math.min(2, hits);
  const score = Math.max(MIN_SCORE, Math.min(MAX_SCORE, MIN_SCORE + lengthPoints + evidence));
  const comment =
    evidence >= 2
      ? `Touches on ${dimension.label.toLowerCase()} in several places. To score higher, go deeper: ${dimension.criteria}`
      : `Little evidence of ${dimension.label.toLowerCase()}. An interviewer looks for this: ${dimension.criteria}`;
  return { dimension: dimension.key, score, comment };
}

export class HeuristicEvaluator implements AnswerEvaluator {
  readonly id = HEURISTIC_EVALUATOR_ID;

  async evaluate({ question, answer, rubric }: EvaluationInput): Promise<Evaluation> {
    const text = answer.content;
    const ratio = wordCount(text) / SUBSTANTIAL_WORDS[question.category];
    // 0 for a sketch, 1 for half of a substantial answer, 2 for a substantial one.
    const lengthPoints = ratio >= 1 ? 2 : ratio >= 0.5 ? 1 : 0;
    const scores = rubric.dimensions.map((dimension) =>
      scoreDimension(dimension, text, lengthPoints),
    );

    const weakest = [...scores].sort((a, b) => a.score - b.score)[0]!;
    const weakestLabel = rubric.dimensions.find((d) => d.key === weakest.dimension)!.label;
    const summary = [
      ratio < 0.5
        ? "This answer is short for the question, which limits every dimension."
        : "This answer has reasonable depth.",
      `The biggest gap by rubric coverage is ${weakestLabel.toLowerCase()}.`,
      "Scored by the offline heuristic (keyword and length coverage, not comprehension); configure an LLM provider for a real review.",
    ].join(" ");

    return { summary, scores };
  }
}
