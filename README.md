# Lattice

[![CI](https://github.com/sidchi/lattice/actions/workflows/ci.yml/badge.svg)](https://github.com/sidchi/lattice/actions/workflows/ci.yml)

Interview practice platform: a curated question bank, timed mock interviews, and rubric-based AI
feedback that tracks your weak areas over time.

> Status: early scaffold. See [ROADMAP.md](ROADMAP.md) for what is built and what is next.

## Why

Most interview prep tools are flashcards. Real interviews are timed, open-ended and judged against
an (unwritten) rubric. Lattice makes that rubric explicit: you answer under time pressure, get
scored on the same dimensions an interviewer uses, and see which dimensions keep costing you.

## Architecture

```
            ┌──────────────────────────── Next.js 15 (App Router) ────────────────────────────┐
 Browser ──▶│  Server Components (pages)   Route Handlers (/api/*)   Server Actions (planned) │
            │            │                         │                        │                 │
            │            └──────────────┬──────────┴────────────────────────┘                 │
            │                    src/lib (domain logic, env validation)                       │
            └───────────────┬──────────────────────┬──────────────────────┬──────────────────┘
                            ▼                      ▼                      ▼
                    Prisma (SQLite dev,     NextAuth (Google     LLM provider interface
                    Postgres prod)          OAuth)               (rubric scoring, mocked in tests)
```

Boxes below the app are planned; the roadmap adds them one PR at a time.

| Concern       | Choice                                                       |
| ------------- | ------------------------------------------------------------ |
| Framework     | Next.js 15 App Router, React 19, TypeScript (strict)         |
| Styling       | Tailwind CSS v4 with CSS-variable design tokens              |
| Config        | `zod`-validated environment (`src/lib/env.ts`)               |
| Testing       | Vitest + Testing Library (jsdom), v8 coverage                |
| Quality gates | ESLint (`next/core-web-vitals`, `next/typescript`), Prettier |
| CI            | GitHub Actions: lint → format → type-check → test → build    |

## Getting started

Requires Node.js 20.18+ (CI uses the version in `.nvmrc`).

```bash
npm ci
cp .env.example .env.local   # optional today; every variable is optional until auth/db land
npm run dev                  # http://localhost:3000
```

Health check: `curl localhost:3000/api/health`.

## Scripts

| Script                   | What it does                                         |
| ------------------------ | ---------------------------------------------------- |
| `npm run dev`            | Dev server                                           |
| `npm run build`          | Production build                                     |
| `npm run lint`           | ESLint                                               |
| `npm run format[:check]` | Prettier (write / verify)                            |
| `npm run typecheck`      | `tsc --noEmit`                                       |
| `npm test`               | Unit tests (`npm run test:coverage` for v8 coverage) |
| `npm run check`          | Everything CI runs except the build                  |

## Project layout

```
src/
  app/            routes (pages, layouts, route handlers) with colocated tests
  lib/            framework-agnostic logic: env validation, site metadata, health report
  test/           Vitest setup
```

## License

MIT
