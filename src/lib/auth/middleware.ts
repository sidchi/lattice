import { getToken } from "next-auth/jwt";
import { NextResponse, type NextRequest } from "next/server";

import { isProtectedPath, signInUrl } from "./paths";

/**
 * Optimistic route guard: a protected request without a valid session cookie is redirected to
 * sign-in with a return path. It only decrypts the cookie (no database), so it is cheap and
 * Edge-compatible.
 *
 * This is a UX layer, not the security boundary. Pages and server actions still call
 * `requireUser()`, so a middleware misconfiguration or bypass cannot expose data.
 */
export async function authMiddleware(
  req: NextRequest,
  secret: string | undefined,
): Promise<NextResponse> {
  if (!isProtectedPath(req.nextUrl.pathname)) return NextResponse.next();

  // No secret means sign-in is not configured, so nobody can be signed in.
  const token = secret ? await getToken({ req, secret }) : null;
  if (token?.sub) return NextResponse.next();

  const { pathname, search } = req.nextUrl;
  return NextResponse.redirect(new URL(signInUrl(`${pathname}${search}`), req.url));
}
