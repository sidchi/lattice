"use client";

import { signIn, signOut } from "next-auth/react";
import { useState } from "react";

const buttonClass =
  "bg-accent text-background inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current disabled:cursor-wait disabled:opacity-60";

/** Starts the Google OAuth flow and returns to `callbackUrl` (already sanitized) afterwards. */
export function GoogleSignInButton({ callbackUrl }: { callbackUrl: string }) {
  const [pending, setPending] = useState(false);
  return (
    <button
      type="button"
      className={buttonClass}
      disabled={pending}
      aria-busy={pending}
      onClick={() => {
        setPending(true);
        void signIn("google", { callbackUrl });
      }}
    >
      {pending ? "Redirecting to Google…" : "Continue with Google"}
    </button>
  );
}

export function SignOutButton() {
  const [pending, setPending] = useState(false);
  return (
    <button
      type="button"
      className="border-border rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-current/5 disabled:opacity-60"
      disabled={pending}
      onClick={() => {
        setPending(true);
        void signOut({ callbackUrl: "/" });
      }}
    >
      Sign out
    </button>
  );
}
