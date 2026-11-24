/**
 * `/history` URL state. Like the question bank, everything lives in the query string so a view
 * is linkable and the filter is a plain GET form: `/history?scoredBy=anthropic%3Amodel&page=2`.
 * Parsing is forgiving: an unknown evaluator or a malformed page falls back to the default.
 */

export const HISTORY_PATH = "/history";

type SearchParams = Record<string, string | string[] | undefined>;

export type HistoryParams = {
  /** 1-based page of the session list. */
  page: number;
  /** Evaluator id to narrow progress to; undefined means every evaluator. */
  evaluator?: string;
};

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * Reads `page` and `scoredBy`. The evaluator must be one the user actually has scores from,
 * so arbitrary strings never reach a query or the page.
 */
export function parseHistoryParams(
  params: SearchParams,
  knownEvaluators: readonly string[],
): HistoryParams {
  const rawPage = first(params.page);
  const page = rawPage && /^[1-9]\d{0,5}$/.test(rawPage) ? Number(rawPage) : 1;
  const scoredBy = first(params.scoredBy);
  const evaluator = scoredBy && knownEvaluators.includes(scoredBy) ? scoredBy : undefined;
  return { page, ...(evaluator && { evaluator }) };
}

/** Canonical URL: default values are omitted, so `/history` is the unfiltered first page. */
export function historyHref({ page, evaluator }: Partial<HistoryParams> = {}): string {
  const query = new URLSearchParams();
  if (evaluator) query.set("scoredBy", evaluator);
  if (page && page > 1) query.set("page", String(page));
  const search = query.toString();
  return search ? `${HISTORY_PATH}?${search}` : HISTORY_PATH;
}
