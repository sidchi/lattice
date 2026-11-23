import type { NextRequest } from "next/server";

import { authMiddleware } from "@/lib/auth/middleware";

export function middleware(req: NextRequest) {
  return authMiddleware(req, process.env.NEXTAUTH_SECRET || undefined);
}

export const config = {
  // Must be a static literal for Next.js. Keep in sync with PROTECTED_PREFIXES in
  // src/lib/auth/paths.ts; middleware.test.ts fails if they drift.
  matcher: ["/dashboard/:path*", "/practice/:path*", "/history/:path*"],
};
