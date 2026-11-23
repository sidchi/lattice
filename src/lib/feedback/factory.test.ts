// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { evaluationFor, evaluationInput } from "@/test/feedback";

import { createEvaluator } from "./factory";
import { HeuristicEvaluator } from "./heuristic";
import { LlmEvaluator } from "./llm-evaluator";
import type { FetchLike } from "./providers";

describe("createEvaluator", () => {
  it("uses the offline heuristic without an LLM configuration", () => {
    expect(createEvaluator(null)).toBeInstanceOf(HeuristicEvaluator);
  });

  const reply = JSON.stringify(evaluationFor("SYSTEM_DESIGN", 4));

  it.each([
    [
      "anthropic",
      "https://api.anthropic.com/v1/messages",
      { content: [{ type: "text", text: reply }] },
    ],
    [
      "openai",
      "https://api.openai.com/v1/chat/completions",
      { choices: [{ message: { content: reply } }] },
    ],
  ] as const)("wires %s end to end", async (provider, url, body) => {
    const fetch = vi.fn<FetchLike>(async () => new Response(JSON.stringify(body)));

    const evaluator = createEvaluator(
      { provider, apiKey: "test-key", model: "test-model" },
      { fetch },
    );
    expect(evaluator).toBeInstanceOf(LlmEvaluator);
    expect(evaluator.id).toBe(`${provider}:test-model`);
    await expect(evaluator.evaluate(evaluationInput())).resolves.toEqual(
      evaluationFor("SYSTEM_DESIGN", 4),
    );
    expect(fetch.mock.calls[0]![0]).toBe(url);
  });
});
