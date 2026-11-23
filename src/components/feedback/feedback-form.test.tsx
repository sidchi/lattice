import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FeedbackForm } from "./feedback-form";

describe("FeedbackForm", () => {
  it("posts the session id to the action", () => {
    const { container } = render(
      <FeedbackForm sessionId="s1" regenerate={false} action={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: "Get feedback" })).toBeEnabled();
    const form = container.querySelector("form")!;
    expect(Object.fromEntries(new FormData(form))).toEqual({ sessionId: "s1" });
  });

  it("asks to regenerate when feedback already exists", () => {
    const { container } = render(<FeedbackForm sessionId="s1" regenerate action={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Regenerate feedback" })).toBeEnabled();
    expect(Object.fromEntries(new FormData(container.querySelector("form")!))).toEqual({
      sessionId: "s1",
      regenerate: "true",
    });
  });

  it("disables the button and says it is evaluating while the action runs", async () => {
    let finish!: () => void;
    const action = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    render(<FeedbackForm sessionId="s1" regenerate={false} action={action} />);

    fireEvent.click(screen.getByRole("button", { name: "Get feedback" }));
    const button = await screen.findByRole("button", { name: "Evaluating…" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(action).toHaveBeenCalledOnce();

    await act(async () => finish());
    expect(await screen.findByRole("button", { name: "Get feedback" })).toBeEnabled();
  });
});
