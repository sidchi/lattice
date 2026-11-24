import { HEURISTIC_EVALUATOR_ID } from "@/lib/feedback/heuristic";
import { MAX_SCORE, SCALE_ANCHORS } from "@/lib/feedback/rubric";
import { EMPTY_ANSWER_EVALUATOR_ID, type FeedbackView } from "@/lib/feedback/service";

/** Human-readable source of a piece of feedback. */
export function evaluatorLabel(evaluator: string): string {
  if (evaluator === HEURISTIC_EVALUATOR_ID) return "Offline heuristic (keyword coverage)";
  if (evaluator === EMPTY_ANSWER_EVALUATOR_ID) return "No answer to evaluate";
  const [provider, ...model] = evaluator.split(":");
  const name =
    provider === "anthropic" ? "Anthropic" : provider === "openai" ? "OpenAI-compatible" : provider;
  return model.length ? `${name} · ${model.join(":")}` : evaluator;
}

const scoreTone = (score: number) =>
  score >= 4 ? "bg-emerald-600" : score === 3 ? "bg-amber-500" : "bg-rose-600";

function ScoreBar({ score }: { score: number }) {
  return (
    <span
      className="bg-border/60 block h-1.5 w-full overflow-hidden rounded-full"
      aria-hidden="true"
    >
      <span
        className={`block h-full rounded-full ${scoreTone(score)}`}
        style={{ width: `${(score / MAX_SCORE) * 100}%` }}
      />
    </span>
  );
}

/** Rubric feedback for one answer: overall score, summary, then each dimension. */
export function FeedbackPanel({ feedback }: { feedback: FeedbackView }) {
  return (
    <section
      aria-label="Feedback"
      className="border-border flex flex-col gap-4 rounded-lg border p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-lg font-semibold">
          Overall{" "}
          <span className="tabular-nums">
            {feedback.overallScore}/{MAX_SCORE}
          </span>
          <span className="text-muted text-sm font-normal">
            {" "}
            · {SCALE_ANCHORS[feedback.overallScore]}
          </span>
        </p>
        <p className="text-muted text-xs">{evaluatorLabel(feedback.evaluator)}</p>
      </div>
      <p>{feedback.summary}</p>
      <dl className="grid gap-4 sm:grid-cols-2">
        {feedback.scores.map((score) => (
          <div key={score.dimension} className="flex flex-col gap-1.5">
            <dt className="flex items-baseline justify-between gap-2 text-sm font-medium">
              <span>{score.label}</span>
              <span className="tabular-nums" aria-label={`${score.score} out of ${MAX_SCORE}`}>
                {score.score}/{MAX_SCORE}
              </span>
            </dt>
            <dd className="flex flex-col gap-1.5">
              <ScoreBar score={score.score} />
              {score.comment && <span className="text-muted text-sm">{score.comment}</span>}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
