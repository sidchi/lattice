# Lattice

[![CI](https://github.com/sidchi/lattice/actions/workflows/ci.yml/badge.svg)](https://github.com/sidchi/lattice/actions/workflows/ci.yml)

Interview practice platform: a curated question bank, timed mock interviews, and rubric-based AI
feedback that tracks your weak areas over time.

> Status: early development (data model, Google sign-in and the question bank are in). See [ROADMAP.md](ROADMAP.md) for what is built and what is next.

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
| Auth          | NextAuth v4, Google OAuth, encrypted JWT session cookies     |
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

### Enabling Google sign-in

Sign-in is off until it is configured; `/signin` then shows setup instructions instead of the
Google button.

1. In Google Cloud Console, create an **OAuth client ID** of type _Web application_.
2. Add the authorized redirect URI `http://localhost:3000/api/auth/callback/google`.
3. Put `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and a `NEXTAUTH_SECRET`
   (`openssl rand -base64 32`) in `.env.local` and restart `npm run dev`.

Env validation refuses a half-configured setup (only one Google credential, or Google without a
secret) at startup rather than at the first sign-in.

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

## Question bank

`/questions` lists the bank with category, difficulty and company filters; `/questions/<slug>`
shows the full prompt. Both are public: browsing should not need an account, while practice
sessions (`/practice`, `/history`) do.

```
/questions?category=coding&difficulty=hard&company=stripe&page=2
           └──────────── parseQuestionFilters() ─────────────┘
                                │  forgiving: bad values drop that one filter
                                ▼
            listQuestions()  +  getQuestionFacets()      (src/lib/questions/repository.ts)
                                │
                                ▼
            questionsHref(filters) === requested URL ? render : redirect(canonical)
```

- **URL is the state.** Filters are query parameters with public slugs (`system-design`, not
  `SYSTEM_DESIGN`), so every view is linkable and the back button works. The filter form is a
  plain GET form: no client JavaScript, no client state to keep in sync.
- **One URL per view.** A GET form submits empty selects (`?category=&company=`), and links pick up
  stray parameters. The page redirects any non-canonical query, including a page past the end,
  to the canonical URL built by `questionsHref()`, which also makes caching and analytics simpler.
- **Faceted counts.** Each filter option shows how many questions it would return. Each facet
  applies every _other_ active filter but not its own (the usual faceted-search rule), so with
  `category=coding` selected the category list still shows the system-design count. Zero-count
  options are disabled rather than hidden, so the list does not jump around.
- **Deterministic paging.** Ordered by title, then slug. Ordering by difficulty would sort
  alphabetically (`EASY, HARD, MEDIUM`) because enums are `TEXT` on SQLite. Paging is
  `OFFSET`-based, which is fine for a bank of hundreds; a large, frequently changing list would
  want keyset pagination.
- **Tested end to end.** The read model and both pages are tested against a real SQLite database
  loaded with the real seed, not mocked query results.

## Authentication

```
 /dashboard ──▶ middleware: valid session cookie? ──no──▶ /signin?callbackUrl=/dashboard
                    │ yes                                   │ "Continue with Google"
                    ▼                                       ▼
            page: requireUser() ◀── session cookie ── /api/auth/callback/google
                                    (our User.id)        signIn: verified email only
                                                         jwt: upsert User by email
```

- **Google OAuth via NextAuth v4** (`src/lib/auth/options.ts`). Only verified Google emails are
  accepted, because users are keyed on email. On first sign-in the `jwt` callback upserts the
  `User` row and puts _our_ id, not Google's subject id, into the token. `session.user.id` is
  that id everywhere.
- **JWT sessions, no session table.** The cookie is an encrypted JWT (30-day rolling expiry), so
  checking a session is a decrypt, not a query, and middleware stays Edge-compatible. The cost is
  revocation: signing out clears one browser, and a stolen cookie stays valid until it expires.
  If that matters later, switch to database sessions or add a per-user `tokenVersion` checked in
  the `jwt` callback.
- **Two layers of protection.** `src/middleware.ts` redirects anonymous requests to `/signin`
  early (cheap, cookie-only). Pages call `requireUser()` from `src/auth.ts`, which is the actual
  authorization check, so a middleware bypass or a missing matcher entry can't expose data.
- **No open redirects.** `callbackUrl` is reduced to a same-origin path
  (`src/lib/auth/paths.ts`); absolute, protocol-relative and backslash URLs fall back to
  `/dashboard`. Error codes on `/signin` map to fixed copy and are never echoed.
- **Testable seams.** The callbacks depend on a `UserStore` interface. Unit tests drive them with
  a mocked Google profile and an in-memory store. The Prisma store is tested against a real
  SQLite database, and the middleware against real encrypted cookies.

## Project layout

```
src/
  app/            routes (pages, layouts, route handlers) with colocated tests
  auth.ts         server-side session helpers: getCurrentUser(), requireUser()
  middleware.ts   early redirect for protected routes
  components/     shared UI (auth buttons, question badges, filters, pagination)
  lib/            framework-agnostic logic: env validation, auth rules, Prisma client, seed,
                  question bank filters and read model
  types/          module augmentation (NextAuth session shape)
  generated/      Prisma client (generated on install, git-ignored)
  test/           Vitest setup and a throwaway-SQLite helper for database tests
prisma/           schema, migrations, seed entry point
```

## License

MIT
