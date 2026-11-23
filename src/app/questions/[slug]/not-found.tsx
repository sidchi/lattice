import Link from "next/link";

export default function QuestionNotFound() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-16 sm:px-6">
      <h1 className="text-2xl font-bold tracking-tight">Question not found</h1>
      <p className="text-muted">It may have been renamed or retired from the question bank.</p>
      <p>
        <Link href="/questions" className="text-accent underline underline-offset-4">
          Browse all questions
        </Link>
      </p>
    </main>
  );
}
