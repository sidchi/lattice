import Link from "next/link";

import { MAIN_CONTENT_ID } from "@/components/layout/skip-link";

export default function PracticeSessionNotFound() {
  return (
    <main
      id={MAIN_CONTENT_ID}
      tabIndex={-1}
      className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-16 focus:outline-none sm:px-6"
    >
      <h1 className="text-2xl font-bold tracking-tight">Session not found</h1>
      <p className="text-muted">It may have been deleted, or it belongs to another account.</p>
      <p>
        <Link href="/practice" className="text-accent underline underline-offset-4">
          Start a new session
        </Link>
      </p>
    </main>
  );
}
