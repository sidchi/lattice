import NextAuth from "next-auth";
import type { NextRequest } from "next/server";

import { getAuthOptions } from "@/auth";

type RouteContext = { params: Promise<{ nextauth: string[] }> };

/**
 * NextAuth's OAuth endpoints (/api/auth/signin/google, /callback/google, /session, ...).
 * Options are resolved per request so the build never needs OAuth secrets; without them the
 * endpoints answer 503 instead of failing at import.
 */
async function handler(req: NextRequest, context: RouteContext): Promise<Response> {
  const options = getAuthOptions();
  if (!options) {
    return Response.json({ error: "Sign-in is not configured on this server." }, { status: 503 });
  }
  // NextAuth v4 types its return as `any`; it resolves to a Response for route handlers.
  return (await NextAuth(req, context, options)) as Response;
}

export { handler as GET, handler as POST };
