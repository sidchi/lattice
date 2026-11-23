import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { FeedbackView } from "@/lib/feedback/service";

import { evaluatorLabel, FeedbackPanel } from "./feedback-panel";

const feedback: FeedbackView = {
  overallScore: 3,
  summary: "Clear architecture; trade-offs are thin.",
  evaluator: "openai:test-model",
  rubricVersion: 1,
  createdAt: new Date("2026-11-24T00:00:00Z"),
  scores: [
    { dimension: "architecture", label: "Architecture", score: 4, comment: "Concrete components." },
    { dimension: "tradeoffs", label: "Trade-offs", score: 2, comment: null },
  ],
};

describe("FeedbackPanel", () => {
  it("shows the overall score with its anchor, the summary and the source", () => {
    render(<FeedbackPanel feedback={feedback} />);
    const panel = screen.getByRole("region", { name: "Feedback" });
    expect(panel).toHaveTextContent("Overall 3/5 · Adequate: meets the bar with gaps");
    expect(panel).toHaveTextContent("Clear architecture; trade-offs are thin.");
    expect(panel).toHaveTextContent("OpenAI-compatible · test-model");
  });

  it("lists each dimension with an accessible score and optional comment", () => {
    render(<FeedbackPanel feedback={feedback} />);
    const terms = screen.getAllByRole("term");
    expect(terms.map((term) => term.textContent)).toEqual(["Architecture4/5", "Trade-offs2/5"]);
    expect(within(terms[0]!).getByLabelText("4 out of 5")).toBeInTheDocument();
    expect(screen.getByText("Concrete components.")).toBeInTheDocument();
    expect(screen.getAllByRole("definition")[1]).toHaveTextContent("");
  });
});

describe("evaluatorLabel", () => {
  it.each([
    ["heuristic-v1", "Offline heuristic (keyword coverage)"],
    ["empty-answer", "No answer to evaluate"],
    ["anthropic:claude-x", "Anthropic · claude-x"],
    ["openai:llama3.1:8b", "OpenAI-compatible · llama3.1:8b"],
    ["custom:model", "custom · model"],
    ["legacy", "legacy"],
  ])("%s → %s", (id, label) => {
    expect(evaluatorLabel(id)).toBe(label);
  });
});
