import { describe, expect, it } from "vitest";

import { evaluationInput } from "@/test/feedback";

import { HEURISTIC_EVALUATOR_ID, HeuristicEvaluator } from "./heuristic";
import { validateEvaluation } from "./output";
import { overallScore, RUBRICS } from "./rubric";

const evaluator = new HeuristicEvaluator();

const thin = "Use Redis.";

const rich = `Requirements: 10k requests per second per region, p99 latency under 5 ms, and the limiter must stay available if Redis is down (fail open). Assumptions: limits are per API key; billing is out of scope.

Architecture:
- An API gateway calls a rate-limit service before routing; the service exposes a gRPC endpoint.
- Counters live in a Redis cluster (token bucket per key); limit rules live in Postgres and are cached in memory.
- Limit changes are published as events on Kafka so every gateway node refreshes its cache.

Scalability: shard keys across Redis partitions by consistent hashing; replicas per shard with automatic failover; hot keys get a local pre-aggregation layer. Retries from clients use exponential backoff, and the gateway sheds load with a circuit breaker when Redis is a bottleneck.

Trade-offs: a sliding-window log is exact but costs memory per request, so I chose the token bucket instead of the log. Local counters synced every 100 ms trade a little accuracy for availability and latency versus a strongly consistent central counter. The downside is brief over-admission during a partition.

In summary: first protect availability, then accuracy. ${"Each design choice above follows from the stated latency and availability targets. ".repeat(6)}`;

describe("HeuristicEvaluator", () => {
  it("identifies itself", () => {
    expect(evaluator.id).toBe(HEURISTIC_EVALUATOR_ID);
  });

  it("produces output that passes the same validation as a model's", async () => {
    for (const category of ["SYSTEM_DESIGN", "BEHAVIORAL", "CODING"] as const) {
      const evaluation = await evaluator.evaluate(evaluationInput(rich, category));
      expect(validateEvaluation(evaluation, RUBRICS[category])).toEqual(evaluation);
    }
  });

  it("is deterministic", async () => {
    const input = evaluationInput(rich);
    expect(await evaluator.evaluate(input)).toEqual(await evaluator.evaluate(input));
  });

  it("scores a substantial, on-rubric answer above a one-liner", async () => {
    const overall = async (content: string) => {
      const evaluation = await evaluator.evaluate(evaluationInput(content));
      return overallScore(
        RUBRICS.SYSTEM_DESIGN,
        Object.fromEntries(evaluation.scores.map((score) => [score.dimension, score.score])),
      );
    };
    expect(await overall(thin)).toBe(1);
    expect(await overall(rich)).toBe(5);
  });

  it("names the weakest dimension and labels itself as a heuristic", async () => {
    const evaluation = await evaluator.evaluate(
      evaluationInput("We need requirements: 1M users, low latency, an API, a database, a cache."),
    );
    expect(evaluation.summary).toMatch(/short for the question/);
    expect(evaluation.summary).toMatch(
      /biggest gap by rubric coverage is (trade-offs|scalability)/,
    );
    expect(evaluation.summary).toMatch(/offline heuristic/);
    const tradeoffs = evaluation.scores.find((score) => score.dimension === "tradeoffs")!;
    expect(tradeoffs.comment).toMatch(/^Little evidence of trade-offs/);
  });
});
