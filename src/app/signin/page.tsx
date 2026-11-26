import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser, isAuthEnabled } from "@/auth";
import { GoogleSignInButton } from "@/components/auth/auth-buttons";
import { MAIN_CONTENT_ID } from "@/components/layout/skip-link";
import { signInErrorMessage } from "@/lib/auth/errors";
import { safeCallbackUrl } from "@/lib/auth/paths";
import { site } from "@/lib/site";

export const metadata: Metadata = { title: "Sign in" };

type SearchParams = Record<string, string | string[] | undefined>;

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const callbackUrl = safeCallbackUrl(params.callbackUrl);

  if (await getCurrentUser()) redirect(callbackUrl);

  const enabled = isAuthEnabled();
  const error = signInErrorMessage(params.error);

  return (
    <main
      id={MAIN_CONTENT_ID}
      tabIndex={-1}
      className="mx-auto flex max-w-md flex-col gap-8 px-4 py-16 focus:outline-none sm:py-24"
    >
      <header className="flex flex-col gap-2">
        <Link href="/" className="text-accent text-sm font-semibold tracking-wide uppercase">
          {site.name}
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">Sign in</h1>
        <p className="text-muted">
          Sign in to save practice sessions, get feedback and track your progress.
        </p>
      </header>

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm"
        >
          {error}
        </p>
      ) : null}

      {enabled ? (
        <GoogleSignInButton callbackUrl={callbackUrl} />
      ) : (
        <section aria-labelledby="setup-heading" className="border-border rounded-lg border p-4">
          <h2 id="setup-heading" className="font-semibold">
            Sign-in is not configured
          </h2>
          <p className="text-muted mt-1 text-sm">
            Set <code>GOOGLE_CLIENT_ID</code>, <code>GOOGLE_CLIENT_SECRET</code> and{" "}
            <code>NEXTAUTH_SECRET</code> in <code>.env.local</code>, then restart the dev server.
            The README walks through creating a Google OAuth client.
          </p>
        </section>
      )}
    </main>
  );
}
