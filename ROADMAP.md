# Roadmap — lattice

Interview practice platform built from scratch (Next.js 15 App Router, TypeScript, NextAuth with Google OAuth, Prisma). Each item is one PR. The daily pipeline takes the first unchecked item.

- [x] 1. Scaffold: Next.js 15 + TypeScript, Tailwind, ESLint/Prettier, Vitest, GitHub Actions CI (lint, type-check, test, build), README, .env.example
- [x] 2. Data model: Prisma schema (User, Question, Session, Answer, Feedback), SQLite for dev, seed script with ~50 system-design, behavioral and coding questions
- [x] 3. Auth: NextAuth with Google OAuth, protected routes, session handling, tests with a mocked provider
- [x] 4. Question bank: browse and filter by category, difficulty and company; question detail page
- [x] 5. Practice session: timed mock interview flow, answer editor, save progress, submit
- [ ] 6. AI feedback: provider-agnostic LLM interface that scores answers against a rubric (mocked in tests)
- [ ] 7. History and progress: past sessions, scores over time, weak-area summary
- [ ] 8. E2E tests (Playwright) for sign-in, practice flow and results; accessibility pass
- [ ] 9. Production: Postgres via Prisma, Vercel deploy config, demo mode without sign-in
- [ ] 10. Polish: screenshots, architecture diagram, README walkthrough, v1.0 release
