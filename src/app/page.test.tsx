import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { practiceTracks, site } from "@/lib/site";

import HomePage from "./page";

describe("HomePage", () => {
  it("renders the tagline as the only h1", () => {
    render(<HomePage />);
    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent(site.tagline);
  });

  it("links to the signed-in area", () => {
    render(<HomePage />);
    expect(screen.getByRole("link", { name: "Start practicing" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
  });

  it("lists every practice track", () => {
    render(<HomePage />);
    const list = screen.getByRole("list");
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(practiceTracks.length);
    for (const track of practiceTracks) {
      expect(within(list).getByRole("heading", { name: track.title })).toBeInTheDocument();
    }
  });
});
