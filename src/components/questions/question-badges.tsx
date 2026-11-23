import type { Difficulty, QuestionCategory } from "@/generated/prisma/enums";
import { categoryLabel, difficultyLabel, formatTimeLimit } from "@/lib/questions/filters";

const difficultyTone: Record<Difficulty, string> = {
  EASY: "border-emerald-600/40 text-emerald-700 dark:text-emerald-300",
  MEDIUM: "border-amber-600/40 text-amber-700 dark:text-amber-300",
  HARD: "border-rose-600/40 text-rose-700 dark:text-rose-300",
};

const badge = "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium";

/** Category, difficulty and suggested time box for a question, as a row of small badges. */
export function QuestionBadges({
  category,
  difficulty,
  timeLimitSec,
}: {
  category: QuestionCategory;
  difficulty: Difficulty;
  timeLimitSec: number;
}) {
  return (
    <ul className="flex flex-wrap items-center gap-2" aria-label="Question details">
      <li className={`${badge} border-border`}>{categoryLabel(category)}</li>
      <li className={`${badge} ${difficultyTone[difficulty]}`}>{difficultyLabel(difficulty)}</li>
      <li className="text-muted text-xs">
        <span className="sr-only">Suggested time: </span>
        {formatTimeLimit(timeLimitSec)}
      </li>
    </ul>
  );
}
