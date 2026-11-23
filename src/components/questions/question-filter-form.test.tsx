import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Difficulty, QuestionCategory } from "@/generated/prisma/enums";
import type { QuestionFacets } from "@/lib/questions/repository";

import { QuestionFilterForm } from "./question-filter-form";

const facets: QuestionFacets = {
  categories: [
    { value: QuestionCategory.SYSTEM_DESIGN, count: 4 },
    { value: QuestionCategory.BEHAVIORAL, count: 0 },
    { value: QuestionCategory.CODING, count: 6 },
  ],
  difficulties: [
    { value: Difficulty.EASY, count: 3 },
    { value: Difficulty.MEDIUM, count: 5 },
    { value: Difficulty.HARD, count: 2 },
  ],
  companies: [
    { slug: "amazon", name: "Amazon", count: 3 },
    { slug: "netflix", name: "Netflix", count: 0 },
  ],
};

describe("QuestionFilterForm", () => {
  it("is a GET search form targeting the question bank", () => {
    render(<QuestionFilterForm filters={{ page: 1 }} facets={facets} />);
    const form = screen.getByRole("search", { name: "Filter questions" });
    expect(form).toHaveAttribute("method", "get");
    expect(form).toHaveAttribute("action", "/questions");
    expect(screen.queryByRole("link", { name: "Clear" })).not.toBeInTheDocument();
  });

  it("labels options with facet counts and disables empty ones", () => {
    render(<QuestionFilterForm filters={{ page: 1 }} facets={facets} />);
    const category = screen.getByLabelText("Category");
    const options = within(category).getAllByRole<HTMLOptionElement>("option");
    expect(options.map((o) => [o.value, o.textContent, o.disabled])).toEqual([
      ["", "All categories", false],
      ["system-design", "System design (4)", false],
      ["behavioral", "Behavioral (0)", true],
      ["coding", "Coding (6)", false],
    ]);
  });

  it("preselects active filters and never disables a selected option", () => {
    render(
      <QuestionFilterForm
        filters={{ category: QuestionCategory.CODING, company: "netflix", page: 1 }}
        facets={facets}
      />,
    );
    expect(screen.getByLabelText<HTMLSelectElement>("Category").value).toBe("coding");
    const company = screen.getByLabelText<HTMLSelectElement>("Company");
    expect(company.value).toBe("netflix");
    expect(
      within(company).getByRole<HTMLOptionElement>("option", { name: "Netflix (0)" }).disabled,
    ).toBe(false);
    expect(screen.getByRole("link", { name: "Clear" })).toHaveAttribute("href", "/questions");
  });
});
