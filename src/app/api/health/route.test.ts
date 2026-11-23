import { describe, expect, it } from "vitest";

import { buildHealthReport } from "@/lib/health";

import { GET } from "./route";

describe("GET /api/health", () => {
  it("returns 200 with an uncached JSON health report", async () => {
    const response = GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body).toMatchObject({ status: "ok", service: "lattice", environment: "test" });
    expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
  });
});

describe("buildHealthReport", () => {
  it("uses the injected clock", () => {
    const report = buildHealthReport(new Date("2026-01-02T03:04:05.000Z"));
    expect(report.timestamp).toBe("2026-01-02T03:04:05.000Z");
  });
});
