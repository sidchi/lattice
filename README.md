# Lattice

[![CI](https://github.com/sidchi/lattice/actions/workflows/ci.yml/badge.svg)](https://github.com/sidchi/lattice/actions/workflows/ci.yml)

Interview practice platform: a curated question bank, timed mock interviews, and rubric-based AI
feedback that tracks your weak areas over time.

> Status: early development (data model, Google sign-in, the question bank, timed practice sessions and rubric feedback are in). See [ROADMAP.md](ROADMAP.md) for what is built and what is next.

## Why

Most interview prep tools are flashcards. Real interviews are timed, open-ended and judged against
an (unwritten) rubric. Lattice makes that rubric explicit: you answer under time pressure, get
scored on the same dimensions an interviewer uses, and see which dimensions keep costing you.

## Architecture

```
            ┌──────────────────────────── Next.js 15 (App Router) ────────────────────────────┐
 Browser ──▶│  Server Components (pages)   Route Handlers (/api/*)   Server Actions           │
            │            │                         │                        │                 │
            │            └──────────────┬──────────┴────────────────────────┘                 │
            │                    src/lib (domain logic, env validation)                       │
            └───────────────┬──────────────────────┬──────────────────────┬──────────────────┘
                            ▼                      ▼                      ▼
                    Prisma (SQLite dev,     NextAuth (Google     AnswerEvaluator: LLM over
                    Postgres prod)          OAuth)               fetch, or offline heuristic
```

All three integrations below the app are in place; Postgres for production arrives with roadmap item 9.

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

## Practice sessions

`/practice` starts a timed mock interview: one question from its detail page ("Practice this
question"), or 1-3 random questions filtered by category and difficulty. `/practice/<id>` runs
the session and, once it is submitted, shows a read-only review.

```
 start ──▶ PracticeSession IN_PROGRESS ──submit / deadline + 30 s grace──▶ SUBMITTED
            answers pre-created empty          (one-way, guarded by a conditional UPDATE)
               ▲
               │ autosave every 15 s while dirty, on question switch, and on "Save now"
          PracticeRunner (client) ── countdown from the server deadline, clock skew removed
```

- **The server owns the clock.** The deadline is `startedAt + timeLimitSec`, both stored when the
  session starts (the time box is copied from the questions, so later edits can't move it). The
  browser renders a countdown corrected for its own clock offset, and auto-submits at zero. The
  server accepts writes until the deadline plus a 30-second grace period, which absorbs network
  latency, not extra thinking time.
- **No background job for expiry.** A session whose grace period has passed is finalized lazily
  on its next read or write, with `submittedAt` set to the deadline and the last autosave as the
  answer. A closed laptop still ends up with a correctly submitted session.
- **Race-safe, idempotent writes.** Saves and submit run in a transaction that rechecks the status,
  and the status flip is a conditional `UPDATE … WHERE status = 'IN_PROGRESS'`, so a late autosave
  cannot modify a submitted session. Submitting twice is a no-op success (double clicks, retries).
  Time spent per answer only grows and is capped at the time box, so a stale second tab cannot
  roll it back.
- **Server actions are endpoints.** Every action re-authenticates with `requireUser()` and
  validates its arguments with zod. Ownership is part of every query, and another user's session
  id behaves exactly like a missing one (`not_found`, 404), so ids cannot be probed.
- **Time is measured, not counted.** The runner credits wall-clock time to the question on
  screen whenever it saves or switches, because background tabs throttle `setInterval` to a
  minute or more.

Trade-off: two tabs editing the same answer are last-write-wins. An answer `version` column with
compare-and-set would detect it; for a single-user practice tool the simpler model wins.

## Answer feedback

Once a session is submitted, "Get feedback" scores every answer against the rubric for its
category and stores the result. Each answer gets a 1-5 score per dimension with a comment, a
short summary, and an overall score.

```
 review page ──"Get feedback"──▶ requestFeedbackAction ──▶ generateSessionFeedback
                                  (requireUser, zod)          │ submitted sessions only, owner-scoped
                                                              │ skip answers that already have feedback
                                                              ▼ (empty answers: fixed score, no call)
                         AnswerEvaluator.evaluate(question, answer, rubric)   ×N in parallel
                         ├─ LlmEvaluator ── prompt.ts ──▶ ChatModel ──▶ Anthropic Messages API
                         │      ▲ output.ts: extract JSON,      └─────▶ OpenAI-compatible Chat API
                         │      │ validate vs. rubric, 1 repair try      (OpenAI, Ollama, vLLM, …)
                         └─ HeuristicEvaluator (offline default, deterministic)
                                                              │
                         overall = rubric-weighted mean ──▶ Feedback + FeedbackScore rows
```

| Category      | Dimensions (weight)                                                                                          |
| ------------- | ------------------------------------------------------------------------------------------------------------ |
| System design | Requirements (1), Architecture (1.5), Scalability & reliability (1.5), Trade-offs (1.5), Communication (1)   |
| Behavioral    | Situation & stakes (1), Actions (1.5), Impact (1.5), Reflection (1), Communication (1)                       |
| Coding        | Approach (1), Correctness (2), Complexity (1), Edge cases & testing (1), Code quality (1), Communication (1) |

- **The rubric is data.** `src/lib/feedback/rubric.ts` drives the prompt, the validation of the
  evaluator's output, the overall score and the UI. Each stored feedback row records the rubric
  version it was scored against.
- **Provider-agnostic.** Everything depends on `AnswerEvaluator`. The LLM evaluator talks to a
  two-method `ChatModel`, and each provider adapter is a small function over `fetch`, so there are
  no vendor SDKs. Configure with `LLM_PROVIDER` (`anthropic` or `openai`), `LLM_API_KEY`,
  `LLM_MODEL` and optionally `LLM_BASE_URL`, which points `openai` at any compatible server such as
  a local Ollama. With nothing set, the offline heuristic runs, so a fresh clone works end to end.
  The UI labels heuristic scores as keyword coverage, not a real review.
- **Model output is untrusted input.** Replies are parsed out of fences or prose, then
  schema-checked: every dimension exactly once, nothing extra, integer scores within 1-5. On a
  violation the model gets one repair turn that shows its own reply and the exact problem. The
  overall score is computed by Lattice, never by the model, so it is reproducible from the stored
  dimension scores.
- **Prompt injection is contained, not ignored.** The answer is fenced in tags (tag-like text inside
  it is neutralized) and the system prompt says to treat it as data. The worst a successful injection
  can do is inflate the scores on the attacker's own answer, which only that user sees.
- **Resilient transport.** Per-request timeout, bounded retries with jittered exponential backoff
  for 429/5xx and network errors (honoring `Retry-After`), no retries on 4xx or after the caller
  cancels, and an overall per-answer budget.
- **Idempotent, partial, race-safe.** Answers that already have feedback are skipped unless the user
  regenerates. One failed answer doesn't discard the others, and a retry only re-evaluates the
  failures. A failed regenerate keeps the previous feedback. If two requests race, the unique
  `Feedback.answerId` decides: one insert wins and the other reports `skipped`.

Trade-offs worth discussing:

- **Synchronous evaluation.** The request waits for the model (seconds per answer, in parallel,
  at most three answers). That keeps the architecture to one process and no queue. At real scale
  this becomes a job queue with status polling or streaming, and the idempotent, per-answer
  service is already the shape a worker needs.
- **Racing duplicate requests can both pay for a model call** even though only one result is
  stored. A short-lived "evaluating" lease per answer would prevent that; for one user clicking a
  button, the unique constraint is enough.
- **Regenerate is not rate-limited** yet. With a paid provider, a per-user budget belongs in front
  of it before a public launch (roadmap item 9).
- **Scores from different evaluators aren't comparable.** The evaluator id and rubric version are
  stored with every row so item 7's progress charts can filter or group by them.

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
  components/     shared UI (auth buttons, question badges, filters, pagination, practice runner,
                  feedback panel)
  lib/            framework-agnostic logic: env validation, auth rules, Prisma client, seed,
                  question bank filters and read model, practice session lifecycle and timer,
                  feedback (rubric, evaluators, LLM providers, output validation)
  types/          module augmentation (NextAuth session shape)
  generated/      Prisma client (generated on install, git-ignored)
  test/           Vitest setup and a throwaway-SQLite helper for database tests
prisma/           schema, migrations, seed entry point
```

## License

MIT
