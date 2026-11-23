import Link from "next/link";

import {
  categoryOptions,
  difficultyOptions,
  hasActiveFilters,
  QUESTIONS_PATH,
  type QuestionFilters,
} from "@/lib/questions/filters";
import type { QuestionFacets } from "@/lib/questions/repository";

const selectClass =
  "border-border bg-background rounded-md border px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current";

type Option = { slug: string; label: string; count: number };

function FilterSelect({
  name,
  label,
  allLabel,
  options,
  selected,
}: {
  name: string;
  label: string;
  allLabel: string;
  options: Option[];
  selected?: string;
}) {
  const id = `filter-${name}`;
  return (
    <div className="flex min-w-40 flex-1 flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <select id={id} name={name} defaultValue={selected ?? ""} className={selectClass}>
        <option value="">{allLabel}</option>
        {options.map((option) => (
          // Zero-count options stay visible but disabled, so the option list does not shift
          // as filters change. The selected option is never disabled.
          <option
            key={option.slug}
            value={option.slug}
            disabled={option.count === 0 && option.slug !== selected}
          >
            {option.label} ({option.count})
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * The question bank filters as a plain GET form: it works without client JavaScript, and the
 * resulting URL is shareable. The page redirects the submitted URL to its canonical form.
 */
export function QuestionFilterForm({
  filters,
  facets,
}: {
  filters: QuestionFilters;
  facets: QuestionFacets;
}) {
  const category = categoryOptions.find((option) => option.value === filters.category);
  const difficulty = difficultyOptions.find((option) => option.value === filters.difficulty);

  return (
    <form
      action={QUESTIONS_PATH}
      method="get"
      role="search"
      aria-label="Filter questions"
      className="flex flex-wrap items-end gap-4"
    >
      <FilterSelect
        name="category"
        label="Category"
        allLabel="All categories"
        selected={category?.slug}
        options={categoryOptions.map((option, index) => ({
          slug: option.slug,
          label: option.label,
          count: facets.categories[index].count,
        }))}
      />
      <FilterSelect
        name="difficulty"
        label="Difficulty"
        allLabel="Any difficulty"
        selected={difficulty?.slug}
        options={difficultyOptions.map((option, index) => ({
          slug: option.slug,
          label: option.label,
          count: facets.difficulties[index].count,
        }))}
      />
      <FilterSelect
        name="company"
        label="Company"
        allLabel="Any company"
        selected={filters.company}
        options={facets.companies.map((company) => ({
          slug: company.slug,
          label: company.name,
          count: company.count,
        }))}
      />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          className="bg-accent text-background rounded-md px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
        >
          Apply filters
        </button>
        {hasActiveFilters(filters) ? (
          <Link href={QUESTIONS_PATH} className="text-muted text-sm underline underline-offset-4">
            Clear
          </Link>
        ) : null}
      </div>
    </form>
  );
}
