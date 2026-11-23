import Link from "next/link";

import { questionsHref, type QuestionFilters } from "@/lib/questions/filters";

const linkClass =
  "border-border rounded-md border px-3 py-1.5 text-sm hover:border-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current";

/** Previous / next links that keep the active filters. Renders nothing for a single page. */
export function Pagination({
  filters,
  page,
  pageCount,
}: {
  filters: QuestionFilters;
  page: number;
  pageCount: number;
}) {
  if (pageCount <= 1) return null;

  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-4">
      {page > 1 ? (
        <Link href={questionsHref(filters, { page: page - 1 })} rel="prev" className={linkClass}>
          ← Previous
        </Link>
      ) : (
        <span />
      )}
      <p className="text-muted text-sm" aria-current="page">
        Page {page} of {pageCount}
      </p>
      {page < pageCount ? (
        <Link href={questionsHref(filters, { page: page + 1 })} rel="next" className={linkClass}>
          Next →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
