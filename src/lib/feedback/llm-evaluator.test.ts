import { describe, expect, it, vi } from "vitest";

import { evaluationFor, evaluationInput } from "@/test/feedback";

import { EvaluationError } from "./evaluator";
import { type ChatModel, type ChatRequest, LlmEvaluator } from "./llm-evaluator";

/** A chat model that replays canned replies and records every request. */
function scriptedModel(...replies: (string | Error)[]) {
  const requests: ChatRequest[] = [];
  const model: ChatModel = {
    id: "fake:model-1",
    complete: vi.fn(async (request: ChatRequest) => {
      // Snapshot: the evaluator appends to the same messages array between attempts.
      requests.push({ ...request, messages: [...request.messages] });
      const reply = replies.shift();
      if (reply === undefined) throw new Error("no scripted reply left");
      if (reply instanceof Error) throw reply;
      return reply;
    }),
  };
  return { model, requests };
}

const input = evaluationInput();
const valid = evaluationFor("SYSTEM_DESIGN", 4);

describe("LlmEvaluator", () => {
  it("takes its id from the model", () => {
    expect(new LlmEvaluator(scriptedModel().model).id).toBe("fake:model-1");
  });

  it("returns a valid evaluation from a single call", async () => {
    const { model, requests } = scriptedModel(JSON.stringify(valid));
    const signal = new AbortController().signal;

    await expect(new LlmEvaluator(model).evaluate(input, { signal })).resolves.toEqual(valid);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ temperature: 0, maxTokens: 1_200, signal });
    expect(requests[0]!.system).toMatch(/technical interviewer/);
    expect(requests[0]!.messages).toEqual([
      { role: "user", content: expect.stringContaining("<candidate_answer>") },
    ]);
  });

  it("repairs invalid output once, showing the model its reply and the problem", async () => {
    const broken = JSON.stringify({ ...valid, scores: valid.scores.slice(1) });
    const { model, requests } = scriptedModel(broken, JSON.stringify(valid));

    await expect(new LlmEvaluator(model).evaluate(input)).resolves.toEqual(valid);
    expect(requests).toHaveLength(2);
    expect(requests[1]!.messages).toEqual([
      requests[0]!.messages[0],
      { role: "assistant", content: broken },
      { role: "user", content: expect.stringMatching(/Missing dimension\(s\): requirements/) },
    ]);
  });

  it("gives up after maxAttempts with the last validation error", async () => {
    const { model } = scriptedModel("no json", "still no json", JSON.stringify(valid));
    const error = await new LlmEvaluator(model).evaluate(input).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(EvaluationError);
    expect((error as EvaluationError).kind).toBe("invalid_output");
    expect(model.complete).toHaveBeenCalledTimes(2);
  });

  it("honors a custom attempt budget", async () => {
    const { model } = scriptedModel("no json", JSON.stringify(valid));
    await expect(new LlmEvaluator(model, { maxAttempts: 1 }).evaluate(input)).rejects.toThrow(
      EvaluationError,
    );
    expect(model.complete).toHaveBeenCalledTimes(1);
  });

  it("does not retry provider errors (the adapter owns transport retries)", async () => {
    const failure = new EvaluationError("HTTP 401", "provider_error");
    const { model } = scriptedModel(failure, JSON.stringify(valid));
    await expect(new LlmEvaluator(model).evaluate(input)).rejects.toBe(failure);
    expect(model.complete).toHaveBeenCalledTimes(1);
  });
});
