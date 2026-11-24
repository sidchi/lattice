import {
  type AnswerEvaluator,
  type Evaluation,
  EvaluationError,
  type EvaluationInput,
} from "./evaluator";
import { parseEvaluationReply } from "./output";
import { buildEvaluationPrompt, buildRepairMessage } from "./prompt";

/**
 * The narrowest possible view of a chat model: messages in, text out. Provider adapters
 * (see ./providers) implement it in a few dozen lines each; nothing else in Lattice knows
 * which vendor is on the other end.
 */
export interface ChatModel {
  /** "provider:model", used as the stored evaluator id. */
  readonly id: string;
  complete(request: ChatRequest): Promise<string>;
}

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type ChatRequest = {
  system: string;
  messages: ChatMessage[];
  maxTokens: number;
  /** Low temperature: grading should be as repeatable as the provider allows. */
  temperature: number;
  signal?: AbortSignal;
};

export type LlmEvaluatorOptions = {
  /** Total attempts including the first. A second attempt sends a repair message. */
  maxAttempts?: number;
  maxTokens?: number;
};

/**
 * Rubric evaluator over any {@link ChatModel}. Builds the prompt, parses and validates the
 * reply, and on invalid output makes one repair attempt that shows the model its own reply
 * and what was wrong with it, which fixes most formatting slips for the price of one call.
 * Provider errors are not retried here: the adapter owns transport-level retries and a
 * failed answer can simply be re-requested by the user.
 */
export class LlmEvaluator implements AnswerEvaluator {
  readonly id: string;
  private readonly maxAttempts: number;
  private readonly maxTokens: number;

  constructor(
    private readonly model: ChatModel,
    { maxAttempts = 2, maxTokens = 1_200 }: LlmEvaluatorOptions = {},
  ) {
    this.id = model.id;
    this.maxAttempts = Math.max(1, maxAttempts);
    this.maxTokens = maxTokens;
  }

  async evaluate(
    input: EvaluationInput,
    { signal }: { signal?: AbortSignal } = {},
  ): Promise<Evaluation> {
    const prompt = buildEvaluationPrompt(input);
    const messages: ChatMessage[] = [{ role: "user", content: prompt.user }];
    let lastError: EvaluationError | undefined;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      const reply = await this.model.complete({
        system: prompt.system,
        messages,
        maxTokens: this.maxTokens,
        temperature: 0,
        signal,
      });
      try {
        return parseEvaluationReply(reply, input.rubric);
      } catch (error) {
        if (!(error instanceof EvaluationError)) throw error;
        lastError = error;
        messages.push(
          { role: "assistant", content: reply },
          { role: "user", content: buildRepairMessage(error.message) },
        );
      }
    }
    throw lastError!;
  }
}
