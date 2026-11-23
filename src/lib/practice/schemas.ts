import { z } from "zod";

import { categoryOptions, difficultyOptions } from "@/lib/questions/filters";

import { MAX_ANSWER_LENGTH, MAX_QUESTIONS, MIN_QUESTIONS } from "./limits";
import { MAX_SESSION_SEC } from "./timer";

/**
 * Input validation for the practice flow. Everything that crosses the server-action boundary
 * is parsed here first: server actions are public HTTP endpoints, so their arguments are
 * untrusted no matter what the UI would send.
 */

const slug = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

/** Empty form fields mean "any", so blank strings become `undefined` before validation. */
const optional = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (value === "" || value === null ? undefined : value), schema.optional());

const categorySlug = z.enum(categoryOptions.map((option) => option.slug) as [string, ...string[]]);
const difficultySlug = z.enum(
  difficultyOptions.map((option) => option.slug) as [string, ...string[]],
);

/**
 * How to choose a session's questions: one specific question (from its detail page), or a
 * random set matching optional category and difficulty filters (from the practice page).
 */
export const startSessionSchema = z.union([
  z.object({ mode: z.literal("question"), question: slug }),
  z.object({
    mode: z.literal("random"),
    category: optional(categorySlug),
    difficulty: optional(difficultySlug),
    count: z.coerce.number().int().min(MIN_QUESTIONS).max(MAX_QUESTIONS).default(1),
  }),
]);

export type StartSessionInput = z.infer<typeof startSessionSchema>;

/** Reads the start form. Returns `null` for anything malformed instead of throwing. */
export function parseStartSession(form: FormData): StartSessionInput | null {
  const result = startSessionSchema.safeParse(Object.fromEntries(form));
  return result.success ? result.data : null;
}

export const answerDraftSchema = z.object({
  answerId: z.string().min(1).max(64),
  content: z.string().max(MAX_ANSWER_LENGTH),
  timeSpentSec: z.number().int().min(0).max(MAX_SESSION_SEC),
});

export type AnswerDraft = z.infer<typeof answerDraftSchema>;

/** The answers a client sends with an autosave or the final submit. */
export const answerDraftsSchema = z
  .array(answerDraftSchema)
  .max(MAX_QUESTIONS)
  .refine((drafts) => new Set(drafts.map((d) => d.answerId)).size === drafts.length, {
    message: "Each answer may appear at most once.",
  });

export const sessionIdSchema = z.string().min(1).max(64);
