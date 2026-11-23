import { getServerEnv } from "./env";

export type HealthReport = {
  status: "ok";
  service: "lattice";
  version: string;
  environment: string;
  timestamp: string;
};

/** Builds the payload served by GET /api/health. `now` is injectable for tests. */
export function buildHealthReport(now: Date = new Date()): HealthReport {
  return {
    status: "ok",
    service: "lattice",
    version: process.env.npm_package_version ?? "0.1.0",
    environment: getServerEnv().NODE_ENV,
    timestamp: now.toISOString(),
  };
}
