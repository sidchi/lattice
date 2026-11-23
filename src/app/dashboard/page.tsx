import type { Metadata } from "next";

import { requireUser } from "@/auth";
import { SignOutButton } from "@/components/auth/auth-buttons";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requireUser("/dashboard");
  const displayName = user.name ?? user.email;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-16 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Welcome, {displayName}</h1>
          <p className="text-muted mt-1 text-sm">Signed in as {user.email}</p>
        </div>
        <SignOutButton />
      </header>
      <p className="text-muted">
        Your practice sessions and progress will appear here as the question bank and practice flow
        land.
      </p>
    </main>
  );
}
