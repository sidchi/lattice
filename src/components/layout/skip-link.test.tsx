import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MAIN_CONTENT_ID, SkipLink } from "./skip-link";

describe("SkipLink", () => {
  it("links to the main content landmark and is only shown on focus", () => {
    render(<SkipLink />);
    const link = screen.getByRole("link", { name: "Skip to main content" });
    expect(link).toHaveAttribute("href", `#${MAIN_CONTENT_ID}`);
    expect(link).toHaveClass("sr-only", "focus:not-sr-only");
  });
});
