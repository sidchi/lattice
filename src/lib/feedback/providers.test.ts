// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { EvaluationError } from "./evaluator";
import type { ChatRequest } from "./llm-evaluator";
import { anthropicChatModel, backoffMs, type FetchLike, openAiChatModel } from "./providers";

type Call = { url: string; init: RequestInit; body: Record<string, unknown> };

/** A fetch double that returns queued responses (or throws queued errors) in order. */
function fakeFetch(...responses: (Response | Error)[]) {
  const calls: Call[] = [];
  const fetch = vi.fn<FetchLike>(async (url, init) => {
    calls.push({ url, init, body: JSON.parse(String(init.body)) as Record<string, unknown> });
    const next = responses.shift();
    if (!next) throw new Error("unexpected request");
    if (next instanceof Error) throw next;
    return next;
  });
  return { fetch, calls };
}

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, ...init });

const request: ChatRequest = {
  system: "Grade this.",
  messages: [{ role: "user", content: "The answer." }],
  maxTokens: 500,
  temperature: 0,
};

const anthropicReply = (text: string) => json({ content: [{ type: "text", text }] });
const sleep = vi.fn(async () => {});
const base = { apiKey: "test-key", model: "test-model", sleep };

describe("anthropicChatModel", () => {
  it("calls the Messages API and joins the text blocks", async () => {
    const { fetch, calls } = fakeFetch(
      json({
        content: [
          { type: "text", text: '{"a":' },
          { type: "tool_use", id: "x" },
          { type: "text", text: "1}" },
        ],
      }),
    );
    const model = anthropicChatModel({ ...base, fetch });

    expect(model.id).toBe("anthropic:test-model");
    await expect(model.complete(request)).resolves.toBe('{"a":1}');
    expect(calls[0]!.url).toBe("https://api.anthropic.com/v1/messages");
    expect(calls[0]!.init.method).toBe("POST");
    expect(calls[0]!.init.headers).toMatchObject({
      "x-api-key": "test-key",
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    });
    expect(calls[0]!.body).toEqual({
      model: "test-model",
      system: "Grade this.",
      messages: request.messages,
      max_tokens: 500,
      temperature: 0,
    });
  });

  it("uses a custom base URL without doubling slashes", async () => {
    const { fetch, calls } = fakeFetch(anthropicReply("ok"));
    await anthropicChatModel({ ...base, fetch, baseUrl: "https://gateway.test/" }).complete(
      request,
    );
    expect(calls[0]!.url).toBe("https://gateway.test/v1/messages");
  });

  it("rejects a response without text", async () => {
    const { fetch } = fakeFetch(json({ content: [] }));
    await expect(anthropicChatModel({ ...base, fetch }).complete(request)).rejects.toMatchObject({
      kind: "invalid_output",
    });
  });
});

describe("openAiChatModel", () => {
  it("calls Chat Completions with the system prompt as the first message", async () => {
    const { fetch, calls } = fakeFetch(json({ choices: [{ message: { content: "graded" } }] }));
    const model = openAiChatModel({ ...base, fetch, baseUrl: "http://localhost:11434/v1" });

    expect(model.id).toBe("openai:test-model");
    await expect(model.complete(request)).resolves.toBe("graded");
    expect(calls[0]!.url).toBe("http://localhost:11434/v1/chat/completions");
    expect(calls[0]!.init.headers).toMatchObject({ authorization: "Bearer test-key" });
    expect(calls[0]!.body).toEqual({
      model: "test-model",
      messages: [{ role: "system", content: "Grade this." }, ...request.messages],
      max_tokens: 500,
      temperature: 0,
    });
  });

  it("defaults to the OpenAI API and rejects empty content", async () => {
    const { fetch, calls } = fakeFetch(json({ choices: [{ message: { content: null } }] }));
    await expect(openAiChatModel({ ...base, fetch }).complete(request)).rejects.toMatchObject({
      kind: "invalid_output",
    });
    expect(calls[0]!.url).toBe("https://api.openai.com/v1/chat/completions");
  });
});

describe("transport", () => {
  it("retries 429 and 5xx, honoring Retry-After", async () => {
    sleep.mockClear();
    const { fetch } = fakeFetch(
      new Response("slow down", { status: 429, headers: { "retry-after": "2" } }),
      new Response("oops", { status: 503 }),
      anthropicReply("ok"),
    );
    await expect(anthropicChatModel({ ...base, fetch }).complete(request)).resolves.toBe("ok");
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenNthCalledWith(1, 2_000);
  });

  it("stops after maxRetries and reports the status", async () => {
    const { fetch } = fakeFetch(
      new Response("down", { status: 500 }),
      new Response("down", { status: 500 }),
    );
    const error = await anthropicChatModel({ ...base, fetch, maxRetries: 1 })
      .complete(request)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(EvaluationError);
    expect(error).toMatchObject({
      kind: "provider_error",
      message: "Provider returned HTTP 500: down",
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("does not retry client errors", async () => {
    const { fetch } = fakeFetch(new Response('{"error":"bad key"}', { status: 401 }));
    await expect(anthropicChatModel({ ...base, fetch }).complete(request)).rejects.toThrow(
      /HTTP 401/,
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("retries network errors, then reports a provider error", async () => {
    const { fetch } = fakeFetch(new TypeError("fetch failed"), new TypeError("fetch failed"));
    await expect(
      anthropicChatModel({ ...base, fetch, maxRetries: 1 }).complete(request),
    ).rejects.toMatchObject({ kind: "provider_error", message: "Provider request failed" });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("times out a hung request", async () => {
    const hang: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) =>
        init.signal!.addEventListener("abort", () => reject(init.signal!.reason)),
      );
    await expect(
      anthropicChatModel({ ...base, fetch: hang, timeoutMs: 20, maxRetries: 0 }).complete(request),
    ).rejects.toMatchObject({ kind: "timeout" });
  });

  it("never retries after the caller aborts", async () => {
    const controller = new AbortController();
    const cancelled = new DOMException("cancelled", "AbortError");
    const fetch = vi.fn<FetchLike>(async () => {
      controller.abort();
      throw cancelled;
    });
    await expect(
      anthropicChatModel({ ...base, fetch }).complete({ ...request, signal: controller.signal }),
    ).rejects.toBe(cancelled);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("backoffMs", () => {
  it("uses Retry-After seconds, capped", () => {
    expect(backoffMs(0, "1.5")).toBe(1_500);
    expect(backoffMs(0, "3600")).toBe(8_000);
  });

  it("falls back to exponential backoff with full jitter", () => {
    expect(backoffMs(0, null, () => 0.999)).toBe(499);
    expect(backoffMs(2, "not-a-number", () => 0.5)).toBe(1_000);
    expect(backoffMs(10, null, () => 0.999)).toBe(7_992);
    expect(backoffMs(3, null, () => 0)).toBe(0);
  });
});
