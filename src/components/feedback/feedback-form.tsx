"use client";

import { useFormStatus } from "react-dom";

function SubmitButton({
  label,
  pendingLabel,
  primary,
}: {
  label: string;
  pendingLabel: string;
  primary: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={
        primary
          ? "bg-accent text-background rounded-md px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
          : "border-border rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-current/5 disabled:cursor-wait disabled:opacity-60"
      }
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

/**
 * Requests feedback for a session. A plain form posting to a server action, so it works
 * before hydration; the button only adds a pending state. Evaluation can take a while with a
 * remote model, hence the explicit "Evaluating…" label.
 */
export function FeedbackForm({
  sessionId,
  regenerate,
  action,
}: {
  sessionId: string;
  regenerate: boolean;
  action: (form: FormData) => Promise<void>;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="sessionId" value={sessionId} />
      {regenerate && <input type="hidden" name="regenerate" value="true" />}
      <SubmitButton
        primary={!regenerate}
        label={regenerate ? "Regenerate feedback" : "Get feedback"}
        pendingLabel="Evaluating…"
      />
    </form>
  );
}
