/**
 * User-facing copy for the `?error=` codes NextAuth appends when it sends someone back to
 * the sign-in page. Unknown codes get a generic message, so arbitrary query text is never
 * echoed into the page.
 */
const messages: Record<string, string> = {
  AccessDenied:
    "That Google account could not be used. Lattice needs an account with a verified email address.",
  OAuthSignin: "Could not start sign-in with Google. Please try again.",
  OAuthCallback: "Google sign-in did not complete. Please try again.",
  Callback: "Google sign-in did not complete. Please try again.",
  Configuration: "Sign-in is misconfigured on this server.",
  SessionRequired: "Please sign in to continue.",
};

const fallback = "Something went wrong while signing in. Please try again.";

export function signInErrorMessage(code: string | string[] | undefined): string | null {
  const value = Array.isArray(code) ? code[0] : code;
  if (!value) return null;
  return (Object.hasOwn(messages, value) && messages[value]) || fallback;
}
