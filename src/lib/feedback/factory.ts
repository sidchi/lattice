import { getLlmConfig, getServerEnv, type LlmConfig } from "@/lib/env";

import type { AnswerEvaluator } from "./evaluator";
import { HeuristicEvaluator } from "./heuristic";
import { LlmEvaluator } from "./llm-evaluator";
import { anthropicChatModel, type FetchLike, openAiChatModel } from "./providers";

/**
 * Picks the evaluator for the current configuration. The only place that maps configuration
 * to a provider; everything downstream depends on {@link AnswerEvaluator} alone.
 */
export function createEvaluator(
  config: LlmConfig | null,
  { fetch }: { fetch?: FetchLike } = {},
): AnswerEvaluator {
  if (!config) return new HeuristicEvaluator();
  const provider = { ...config, fetch };
  const model =
    config.provider === "anthropic" ? anthropicChatModel(provider) : openAiChatModel(provider);
  return new LlmEvaluator(model);
}

/** The evaluator for this server process, built once from the validated environment. */
let cached: AnswerEvaluator | undefined;

export function getEvaluator(): AnswerEvaluator {
  cached ??= createEvaluator(getLlmConfig(getServerEnv()));
  return cached;
}
