import { EvaluationError } from "./evaluator";
import type { ChatModel, ChatRequest } from "./llm-evaluator";

/**
 * Chat-model adapters over plain `fetch`: no vendor SDKs, so adding a provider is one small
 * function and the dependency tree stays lean. Both adapters share the transport below:
 * a per-request timeout, and bounded retries with backoff for responses that are worth
 * retrying (429 and 5xx, honoring `Retry-After`) and for network errors.
 *
 * - `anthropic`: the Anthropic Messages API.
 * - `openai`: the OpenAI Chat Completions API, and anything compatible with it (Azure OpenAI
 *   behind a gateway, OpenRouter, vLLM, Ollama's `/v1` endpoint) via `baseUrl`.
 */

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export type ProviderConfig = {
  apiKey: string;
  model: string;
  baseUrl?: string;
  /** Per-attempt timeout. */
  timeoutMs?: number;
  /** Retries after the first attempt for retryable failures. */
  maxRetries?: number;
  fetch?: FetchLike;
  /** Injected so tests do not wait for real backoff. */
  sleep?: (ms: number) => Promise<void>;
};

const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_MAX_RETRIES = 2;
const MAX_BACKOFF_MS = 8_000;

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Exponential backoff with full jitter, or the server's `Retry-After` when it sends one. */
export function backoffMs(
  attempt: number,
  retryAfter: string | null,
  random = Math.random,
): number {
  const seconds = retryAfter === null ? Number.NaN : Number(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1_000, MAX_BACKOFF_MS);
  return Math.floor(random() * Math.min(MAX_BACKOFF_MS, 500 * 2 ** attempt));
}

const isRetryableStatus = (status: number) => status === 429 || status >= 500;

async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  config: ProviderConfig,
  signal: AbortSignal | undefined,
): Promise<unknown> {
  const fetchImpl = config.fetch ?? fetch;
  const sleep = config.sleep ?? defaultSleep;
  const maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  for (let attempt = 0; ; attempt++) {
    const timeout = AbortSignal.timeout(timeoutMs);
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
    } catch (cause) {
      // The caller cancelled: stop immediately, never retry.
      if (signal?.aborted) throw cause;
      const timedOut = timeout.aborted;
      if (attempt < maxRetries) {
        await sleep(backoffMs(attempt, null));
        continue;
      }
      throw new EvaluationError(
        timedOut ? `Provider timed out after ${timeoutMs} ms` : "Provider request failed",
        timedOut ? "timeout" : "provider_error",
        { cause },
      );
    }

    if (response.ok) return response.json();
    if (isRetryableStatus(response.status) && attempt < maxRetries) {
      await sleep(backoffMs(attempt, response.headers.get("retry-after")));
      continue;
    }
    // The body may echo request details; keep only a short prefix for the logs.
    const detail = (await response.text().catch(() => "")).slice(0, 200);
    throw new EvaluationError(
      `Provider returned HTTP ${response.status}${detail ? `: ${detail}` : ""}`,
      "provider_error",
    );
  }
}

function expectText(value: unknown, what: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new EvaluationError(`Provider response has no ${what}`, "invalid_output");
  }
  return value;
}

export function anthropicChatModel(config: ProviderConfig): ChatModel {
  const url = `${(config.baseUrl ?? "https://api.anthropic.com").replace(/\/+$/, "")}/v1/messages`;
  return {
    id: `anthropic:${config.model}`,
    async complete({ system, messages, maxTokens, temperature, signal }: ChatRequest) {
      const json = (await postJson(
        url,
        { "x-api-key": config.apiKey, "anthropic-version": "2023-06-01" },
        { model: config.model, system, messages, max_tokens: maxTokens, temperature },
        config,
        signal,
      )) as { content?: { type: string; text?: string }[] };
      const text = (json.content ?? [])
        .filter((block) => block.type === "text")
        .map((block) => block.text ?? "")
        .join("");
      return expectText(text, "text content");
    },
  };
}

export function openAiChatModel(config: ProviderConfig): ChatModel {
  const base = (config.baseUrl ?? "https://api.openai.com/v1").replace(/\/+$/, "");
  return {
    id: `openai:${config.model}`,
    async complete({ system, messages, maxTokens, temperature, signal }: ChatRequest) {
      const json = (await postJson(
        `${base}/chat/completions`,
        { authorization: `Bearer ${config.apiKey}` },
        {
          model: config.model,
          messages: [{ role: "system", content: system }, ...messages],
          max_tokens: maxTokens,
          temperature,
        },
        config,
        signal,
      )) as { choices?: { message?: { content?: string | null } }[] };
      return expectText(json.choices?.[0]?.message?.content, "message content");
    },
  };
}
