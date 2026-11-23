/**
 * Route-level auth rules shared by middleware, pages and tests.
 *
 * Kept free of Next.js and NextAuth imports so it runs anywhere (Edge middleware, server
 * components, unit tests) and the rules can be tested exhaustively as plain functions.
 */

export const SIGN_IN_PATH = "/signin";

/** Where a successful sign-in lands when no (safe) callback URL was supplied. */
export const DEFAULT_AFTER_SIGN_IN = "/dashboard";

/**
 * Path prefixes that require a signed-in user. Later roadmap items add their routes here
 * (and to the middleware matcher, which Next.js requires to be a static literal).
 */
export const PROTECTED_PREFIXES = ["/dashboard", "/practice", "/history"] as const;

/** True for a protected prefix itself or anything below it, but not `/dashboards`. */
export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Sanitizes a post-sign-in redirect target. Only same-origin relative paths are allowed, so
 * `/signin?callbackUrl=https://evil.example` cannot be turned into an open redirect.
 * Protocol-relative (`//host`) and backslash (`/\host`, which browsers treat as `//host`)
 * forms are rejected too.
 */
export function safeCallbackUrl(
  raw: string | string[] | null | undefined,
  fallback: string = DEFAULT_AFTER_SIGN_IN,
): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return fallback;
  }
  // Normalize through the URL parser and re-check the origin. Control characters such as a
  // tab inside `/\t/evil.example` are stripped by browsers and would otherwise slip through.
  const base = "http://lattice.invalid";
  let url: URL;
  try {
    url = new URL(value, base);
  } catch {
    return fallback;
  }
  if (url.origin !== base) return fallback;
  if (url.pathname === SIGN_IN_PATH) return fallback;
  return `${url.pathname}${url.search}${url.hash}`;
}

/** The sign-in URL that returns the user to `returnTo` afterwards. */
export function signInUrl(returnTo?: string): string {
  const target = safeCallbackUrl(returnTo);
  if (target === DEFAULT_AFTER_SIGN_IN) return SIGN_IN_PATH;
  return `${SIGN_IN_PATH}?${new URLSearchParams({ callbackUrl: target })}`;
}
