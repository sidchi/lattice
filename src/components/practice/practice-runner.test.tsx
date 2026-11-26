import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PracticeAnswerView } from "@/lib/practice/service";

import { AUTOSAVE_INTERVAL_MS, PracticeRunner, type PracticeRunnerProps } from "./practice-runner";

const START = new Date("2026-11-23T10:00:00.000Z");

function answer(id: string, position: number, title: string): PracticeAnswerView {
  return {
    id,
    position,
    content: "",
    timeSpentSec: 0,
    question: {
      slug: id,
      title,
      prompt: `${title}: synthetic prompt.`,
      category: "SYSTEM_DESIGN",
      difficulty: "MEDIUM",
      timeLimitSec: 300,
    },
  };
}

const twoQuestions = [answer("a1", 0, "Design a cache"), answer("a2", 1, "Design a queue")];

function setup(overrides: Partial<PracticeRunnerProps> = {}) {
  const save = vi.fn<PracticeRunnerProps["save"]>(async () => ({
    ok: true as const,
    savedAt: new Date(Date.now()).toISOString(),
  }));
  const submit = vi.fn<PracticeRunnerProps["submit"]>(async () => ({
    ok: false as const,
    error: "not_found" as const,
  }));
  const props: PracticeRunnerProps = {
    sessionId: "s1",
    deadline: new Date(START.getTime() + 600_000).toISOString(),
    serverNow: START.toISOString(),
    timeLimitSec: 600,
    answers: twoQuestions,
    save,
    submit,
    ...overrides,
  };
  render(<PracticeRunner {...props} />);
  return { save, submit, props };
}

/** Advances fake time and lets the resulting promises (save/submit calls) settle. */
async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

const editor = () => screen.getByLabelText("Your answer");
const timer = () => screen.getByRole("timer", { name: "Time remaining" });

beforeEach(() => {
  vi.useFakeTimers({ now: START });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("PracticeRunner", () => {
  it("shows the first question and a countdown from the server deadline", () => {
    setup();
    expect(screen.getByRole("heading", { name: "Design a cache" })).toBeInTheDocument();
    expect(timer()).toHaveTextContent("10:00");
  });

  it("counts down every second", async () => {
    setup();
    await advance(61_000);
    expect(timer()).toHaveTextContent("8:59");
  });

  it("corrects for a client clock that is wrong", () => {
    // The client clock reads 10:00 but the server said 10:03 at render: 7 minutes remain.
    setup({ serverNow: new Date(START.getTime() + 180_000).toISOString() });
    expect(timer()).toHaveTextContent("7:00");
  });

  it("autosaves edits on the interval, with time spent on the active question", async () => {
    const { save } = setup();
    fireEvent.change(editor(), { target: { value: "Start with requirements" } });

    await advance(AUTOSAVE_INTERVAL_MS);

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("s1", [
      { answerId: "a1", content: "Start with requirements", timeSpentSec: 15 },
      { answerId: "a2", content: "", timeSpentSec: 0 },
    ]);
    expect(screen.getByRole("status")).toHaveTextContent(/Saved at/);
  });

  it("does not autosave when nothing changed", async () => {
    const { save } = setup();
    await advance(AUTOSAVE_INTERVAL_MS * 3);
    expect(save).not.toHaveBeenCalled();
  });

  it("saves when switching questions and keeps each answer separate", async () => {
    const { save } = setup();
    fireEvent.change(editor(), { target: { value: "cache answer" } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Question 2/ }));
    });

    expect(save).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("heading", { name: "Design a queue" })).toBeInTheDocument();
    expect(editor()).toHaveValue("");

    fireEvent.click(screen.getByRole("button", { name: /Question 1/ }));
    expect(editor()).toHaveValue("cache answer");
    expect(screen.getByRole("button", { name: /Question 1/ })).toHaveAttribute(
      "aria-current",
      "step",
    );
  });

  it("credits time to the question that was on screen", async () => {
    const { save } = setup();
    await advance(20_500);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Question 2/ }));
    });
    await advance(10_000);
    fireEvent.click(screen.getByRole("button", { name: "Save now" }));
    await act(async () => {});

    expect(save).toHaveBeenLastCalledWith("s1", [
      { answerId: "a1", content: "", timeSpentSec: 20 },
      { answerId: "a2", content: "", timeSpentSec: 10 },
    ]);
  });

  it("resumes from the time already recorded on the server", async () => {
    const { save } = setup({
      answers: [{ ...twoQuestions[0]!, content: "saved", timeSpentSec: 90 }],
    });
    expect(editor()).toHaveValue("saved");
    await advance(5_000);
    fireEvent.click(screen.getByRole("button", { name: "Save now" }));
    await act(async () => {});
    expect(save).toHaveBeenCalledWith("s1", [
      { answerId: "a1", content: "saved", timeSpentSec: 95 },
    ]);
  });

  it("keeps edits and retries after a failed save", async () => {
    const { save } = setup();
    save.mockRejectedValueOnce(new Error("offline"));
    fireEvent.change(editor(), { target: { value: "draft" } });

    await advance(AUTOSAVE_INTERVAL_MS);
    expect(screen.getByRole("status")).toHaveTextContent(/Couldn't save/);

    await advance(AUTOSAVE_INTERVAL_MS);
    expect(save).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("status")).toHaveTextContent(/Saved at/);
  });

  it("stops saving once the server says the session is over", async () => {
    const { save } = setup();
    save.mockResolvedValueOnce({ ok: false, error: "expired" });
    fireEvent.change(editor(), { target: { value: "draft" } });

    await advance(AUTOSAVE_INTERVAL_MS);
    expect(screen.getByRole("status")).toHaveTextContent(/Time is up/);

    fireEvent.change(editor(), { target: { value: "more" } });
    await advance(AUTOSAVE_INTERVAL_MS * 2);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("asks for confirmation before submitting", async () => {
    const { submit } = setup();
    fireEvent.change(editor(), { target: { value: "final answer" } });

    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep working" }));
    expect(submit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Yes, submit" }));
    });

    expect(submit).toHaveBeenCalledWith("s1", [
      { answerId: "a1", content: "final answer", timeSpentSec: 0 },
      { answerId: "a2", content: "", timeSpentSec: 0 },
    ]);
    // The mock reports a failure, so the error is shown and the user can retry.
    expect(screen.getByRole("status")).toHaveTextContent(/no longer exists/);
  });

  it("moves focus into the confirmation and back, and Escape dismisses it", () => {
    const { submit } = setup();
    expect(document.body).toHaveFocus(); // Rendering never steals focus.

    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    const confirm = screen.getByRole("button", { name: "Yes, submit" });
    expect(confirm).toHaveFocus();
    expect(confirm).toHaveAccessibleDescription(/can't edit them afterwards/);
    expect(screen.getByRole("group", { name: /Submit all answers\?/ })).toContainElement(confirm);

    fireEvent.click(screen.getByRole("button", { name: "Keep working" }));
    expect(screen.getByRole("button", { name: "Submit" })).toHaveFocus();

    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    fireEvent.keyDown(screen.getByRole("button", { name: "Yes, submit" }), { key: "Escape" });
    expect(screen.queryByRole("button", { name: "Yes, submit" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit" })).toHaveFocus();
    expect(submit).not.toHaveBeenCalled();
  });

  it("submits automatically when time runs out and locks the editor", async () => {
    const { submit } = setup({ timeLimitSec: 300, answers: [twoQuestions[0]!] });
    // A single question: no question navigation.
    expect(screen.queryByRole("navigation", { name: "Questions" })).not.toBeInTheDocument();
    fireEvent.change(editor(), { target: { value: "partial" } });

    await advance(600_000);

    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit.mock.calls[0]![1][0]).toMatchObject({ content: "partial", timeSpentSec: 300 });
    expect(timer()).toHaveTextContent("0:00");
    expect(editor()).toHaveAttribute("readonly");
  });

  it("announces the final minute to screen readers", async () => {
    setup();
    await advance(540_000);
    expect(screen.getByText("Less than one minute left.")).toBeInTheDocument();
  });

  it("warns before leaving with unsaved edits", () => {
    setup();
    const clean = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);

    fireEvent.change(editor(), { target: { value: "unsaved" } });
    const dirty = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);
  });
});
