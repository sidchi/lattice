import { Difficulty, QuestionCategory } from "@/generated/prisma/enums";

/**
 * Question bank filters and their URL representation.
 *
 * Filters live in the query string (`/questions?category=coding&difficulty=hard`) so every
 * view is linkable, the back button works, and the filter form is a plain GET form that
 * needs no client JavaScript. URL values are lowercase kebab-case slugs rather than raw
 * enum names, so the public URL does not leak the database representation.
 *
 * Parsing is deliberately forgiving: an unknown or malformed value drops that one filter
 * instead of failing the page. A shared link with a typo should still show questions.
 */

export const QUESTIONS_PATH = "/questions";

/** Questions per page. Small enough to scan, large enough that most filters fit on one. */
export const PAGE_SIZE = 12;

export type QuestionFilters = {
  category?: QuestionCategory;
  difficulty?: Difficulty;
  /** Company slug. Not validated against the database here; an unknown slug matches nothing. */
  company?: string;
  /** 1-based page number. */
  page: number;
};

type SearchParams = Record<string, string | string[] | undefined>;

export const categoryOptions = [
  { value: QuestionCategory.SYSTEM_DESIGN, slug: "system-design", label: "System design" },
  { value: QuestionCategory.BEHAVIORAL, slug: "behavioral", label: "Behavioral" },
  { value: QuestionCategory.CODING, slug: "coding", label: "Coding" },
] as const;

/** Ordered easiest first, which is also the order the UI lists them in. */
export const difficultyOptions = [
  { value: Difficulty.EASY, slug: "easy", label: "Easy" },
  { value: Difficulty.MEDIUM, slug: "medium", label: "Medium" },
  { value: Difficulty.HARD, slug: "hard", label: "Hard" },
] as const;

const COMPANY_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Guards against absurd page numbers turning into huge OFFSETs. */
const MAX_PAGE = 10_000;

function first(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim().toLowerCase();
  return trimmed ? trimmed : undefined;
}

function parsePage(value: string | undefined): number {
  if (!value || !/^\d+$/.test(value)) return 1;
  const page = Number(value);
  return page >= 1 ? Math.min(page, MAX_PAGE) : 1;
}

export function categoryLabel(category: QuestionCategory): string {
  return categoryOptions.find((option) => option.value === category)!.label;
}

export function difficultyLabel(difficulty: Difficulty): string {
  return difficultyOptions.find((option) => option.value === difficulty)!.label;
}

/** Reads filters from Next.js `searchParams`. Never throws. */
export function parseQuestionFilters(params: SearchParams): QuestionFilters {
  const category = first(params.category);
  const difficulty = first(params.difficulty);
  const company = first(params.company);

  return {
    category: categoryOptions.find((option) => option.slug === category)?.value,
    difficulty: difficultyOptions.find((option) => option.slug === difficulty)?.value,
    company: company && COMPANY_SLUG.test(company) ? company : undefined,
    page: parsePage(first(params.page)),
  };
}

/** True when any filter (not counting pagination) is applied. */
export function hasActiveFilters(filters: QuestionFilters): boolean {
  return Boolean(filters.category || filters.difficulty || filters.company);
}

/**
 * Canonical URL for a filter state. Parameters appear in a fixed order and defaults are
 * omitted (`page=1`), so equal states produce equal URLs, which keeps links cacheable and
 * makes "is this the current view?" a string comparison.
 *
 * `overrides` patches the current state; changing any filter resets to page 1 unless a page
 * is given explicitly, since page 3 of one filter is meaningless for another.
 */
export function questionsHref(
  filters: QuestionFilters,
  overrides: Partial<QuestionFilters> = {},
): string {
  const filterChanged = (["category", "difficulty", "company"] as const).some(
    (key) => key in overrides && overrides[key] !== filters[key],
  );
  const next: QuestionFilters = {
    ...filters,
    ...overrides,
    page: overrides.page ?? (filterChanged ? 1 : filters.page),
  };

  const query = new URLSearchParams();
  const category = categoryOptions.find((option) => option.value === next.category);
  const difficulty = difficultyOptions.find((option) => option.value === next.difficulty);
  if (category) query.set("category", category.slug);
  if (difficulty) query.set("difficulty", difficulty.slug);
  if (next.company) query.set("company", next.company);
  if (next.page > 1) query.set("page", String(next.page));

  const search = query.toString();
  return search ? `${QUESTIONS_PATH}?${search}` : QUESTIONS_PATH;
}

/** Formats a time box in seconds as "45 min" (or "1 h 30 min" for long ones). */
export function formatTimeLimit(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

/**
 * The URL the browser is on, rebuilt from `searchParams`, for comparison with the canonical
 * {@link questionsHref}. A GET filter form submits empty selects as `company=`, and links may
 * carry stray or misspelled parameters; the page redirects those to the canonical URL.
 */
export function requestedHref(params: SearchParams): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) {
      query.append(key, item);
    }
  }
  const search = query.toString();
  return search ? `${QUESTIONS_PATH}?${search}` : QUESTIONS_PATH;
}
