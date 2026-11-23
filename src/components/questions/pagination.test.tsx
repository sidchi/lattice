import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { QuestionCategory } from "@/generated/prisma/enums";

import { Pagination } from "./pagination";

const filters = { category: QuestionCategory.CODING, page: 2 };

describe("Pagination", () => {
  it("renders nothing for a single page", () => {
    const { container } = render(<Pagination filters={filters} page={1} pageCount={1} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("links to neighbouring pages and keeps the filters", () => {
    render(<Pagination filters={filters} page={2} pageCount={3} />);
    expect(screen.getByRole("link", { name: /Previous/ })).toHaveAttribute(
      "href",
      "/questions?category=coding",
    );
    expect(screen.getByRole("link", { name: /Next/ })).toHaveAttribute(
      "href",
      "/questions?category=coding&page=3",
    );
    expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();
  });

  it("omits the links at either end", () => {
    const { rerender } = render(<Pagination filters={filters} page={1} pageCount={2} />);
    expect(screen.queryByRole("link", { name: /Previous/ })).not.toBeInTheDocument();
    rerender(<Pagination filters={filters} page={2} pageCount={2} />);
    expect(screen.queryByRole("link", { name: /Next/ })).not.toBeInTheDocument();
  });
});
