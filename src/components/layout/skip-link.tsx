/**
 * Id of every page's `<main>` element: the skip link's target. Pages also give `<main>`
 * `tabIndex={-1}` so following the link moves keyboard focus there, not just the scroll
 * position (browsers don't focus non-focusable targets of in-page links).
 */
export const MAIN_CONTENT_ID = "main";

/**
 * "Skip to main content" (WCAG 2.4.1, Bypass Blocks). Visually hidden until it receives
 * focus, so it is the first Tab stop on every page without changing the visual design.
 */
export function SkipLink() {
  return (
    <a
      href={`#${MAIN_CONTENT_ID}`}
      className="bg-background text-foreground border-border sr-only rounded-md border px-4 py-2 text-sm font-semibold focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50"
    >
      Skip to main content
    </a>
  );
}
