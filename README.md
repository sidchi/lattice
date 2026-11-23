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
| Data          | Prisma 7 (driver adapters, no query engine), SQLite in dev   |
| Testing       | Vitest + Testing Library (jsdom), v8 coverage                |
| Quality gates | ESLint (`next/core-web-vitals`, `next/typescript`), Prettier |
| CI            | GitHub Actions: lint → format → type-check → test → build    |

## Getting started

Requires Node.js 20.18+ (CI uses the version in `.nvmrc`).

```bash
npm ci
cp .env.example .env.local   # optional; DATABASE_URL defaults to file:./dev.db
npm run db:deploy            # create the SQLite database from prisma/migrations
npm run db:seed              # load the question bank (safe to re-run)
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
| `npm run db:migrate`     | Create a migration after editing the Prisma schema   |
| `npm run db:deploy`      | Apply committed migrations                           |
| `npm run db:seed`        | Upsert the question bank                             |
| `npm run db:reset`       | Drop, re-migrate and re-seed the dev database        |
| `npm run db:studio`      | Browse data in Prisma Studio                         |

## Data model

```
User 1──n PracticeSession 1──n Answer 1──1 Feedback 1──n FeedbackScore
                                 n
                                 │
                                 1
                  Company 1──n QuestionCompany n──1 Question
```

| Model             | Notes                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------ |
| `Question`        | Natural key `slug`; `category` (system design, behavioral, coding), `difficulty`, time box |
| `Company`         | Filter tags. Illustrative topic fits, not claims that a company asked a question           |
| `PracticeSession` | One timed mock interview. Not called `Session`: Auth.js needs that name for login sessions |
| `Answer`          | One per question per session, ordered by `position`; `RESTRICT` keeps answered questions   |
| `Feedback`        | Rubric evaluation of an answer, with one `FeedbackScore` row per rubric dimension          |

Rubric scores are rows rather than a JSON column so "weakest dimensions over time" is a
`GROUP BY`, and the schema stays portable between SQLite and Postgres. Deleting a user
cascades to their sessions, answers and feedback.

The seed (`src/lib/seed`) validates the whole question bank before writing (duplicate slugs,
unknown company tags), then upserts on slugs inside one transaction, so it is safe to re-run
after editing questions. CI applies the migrations to a fresh database, fails if
`prisma migrate diff` finds any drift from `schema.prisma`, and runs the seed.

## Project layout

```
src/
  app/            routes (pages, layouts, route handlers) with colocated tests
  lib/            framework-agnostic logic: env validation, Prisma client, seed, health report
  generated/      Prisma client (generated on install, git-ignored)
  test/           Vitest setup and a throwaway-SQLite helper for database tests
prisma/           schema, migrations, seed entry point
```

## License

MIT
