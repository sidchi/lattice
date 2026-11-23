import { NextResponse } from "next/server";

import { buildHealthReport } from "@/lib/health";

// Always evaluate at request time so the timestamp reflects the live process.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(buildHealthReport(), {
    headers: { "Cache-Control": "no-store" },
  });
}
