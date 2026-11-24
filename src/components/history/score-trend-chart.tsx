import { MAX_SCORE } from "@/lib/feedback/rubric";
import { scoreTrendGeometry } from "@/lib/history/chart";
import { formatScore, type SessionScorePoint } from "@/lib/history/progress";

const dayFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

export function pointLabel(point: SessionScorePoint): string {
  const answers = point.scoredAnswers === 1 ? "1 answer" : `${point.scoredAnswers} answers`;
  return `${dayFormat.format(point.submittedAt)}: ${formatScore(point.averageScore)} / ${MAX_SCORE} (${answers})`;
}

/**
 * Average score per session, oldest to newest, as a server-rendered SVG.
 *
 * One series, so no legend: the heading names it. Each point has a native tooltip (an SVG
 * `<title>` on a hit target larger than the mark), and the same numbers are available as a
 * table for screen readers and anyone who prefers reading values to estimating them.
 */
export function ScoreTrendChart({ points }: { points: readonly SessionScorePoint[] }) {
  const geometry = scoreTrendGeometry(points);
  const { plot } = geometry;
  const first = points[0];
  const last = points.at(-1);
  const description =
    first && last
      ? `${points.length} sessions from ${dayFormat.format(first.submittedAt)} to ${dayFormat.format(last.submittedAt)}. Latest average ${formatScore(last.averageScore)} out of ${MAX_SCORE}.`
      : "No scored sessions yet.";

  return (
    <figure className="flex flex-col gap-2">
      <svg
        viewBox={`0 0 ${geometry.width} ${geometry.height}`}
        className="text-accent h-auto w-full overflow-visible"
        role="img"
        aria-label={`Average score per session. ${description}`}
      >
        {geometry.yTicks.map((tick) => (
          <g key={tick.value}>
            <line
              x1={plot.left}
              x2={plot.right}
              y1={tick.y}
              y2={tick.y}
              stroke="var(--border)"
              strokeWidth={1}
            />
            <text
              x={plot.left - 8}
              y={tick.y}
              textAnchor="end"
              dominantBaseline="middle"
              fill="var(--muted)"
              fontSize={11}
            >
              {tick.value}
            </text>
          </g>
        ))}
        {geometry.path ? (
          <path
            d={geometry.path}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ) : null}
        {geometry.points.map(({ x, y, point }) => (
          <g key={point.sessionId} data-testid="trend-point">
            <circle
              cx={x}
              cy={y}
              r={4}
              fill="currentColor"
              stroke="var(--background)"
              strokeWidth={2}
            />
            {/* Invisible, larger hit target carrying the tooltip. */}
            <circle cx={x} cy={y} r={12} fill="transparent">
              <title>{pointLabel(point)}</title>
            </circle>
          </g>
        ))}
      </svg>
      <figcaption className="text-muted flex justify-between text-xs">
        <span>{first ? dayFormat.format(first.submittedAt) : ""}</span>
        <span>Sessions, oldest to newest · scale 1-{MAX_SCORE}</span>
        <span>{last && points.length > 1 ? dayFormat.format(last.submittedAt) : ""}</span>
      </figcaption>
      <details className="text-sm">
        <summary className="text-muted cursor-pointer">Show as a table</summary>
        <table className="mt-2 w-full text-left">
          <thead>
            <tr className="text-muted">
              <th scope="col" className="py-1 font-medium">
                Submitted
              </th>
              <th scope="col" className="py-1 font-medium">
                Average score
              </th>
              <th scope="col" className="py-1 font-medium">
                Scored answers
              </th>
            </tr>
          </thead>
          <tbody>
            {[...points].reverse().map((point) => (
              <tr key={point.sessionId} className="border-border border-t">
                <td className="py-1">{dayFormat.format(point.submittedAt)}</td>
                <td className="py-1 tabular-nums">{formatScore(point.averageScore)}</td>
                <td className="py-1 tabular-nums">{point.scoredAnswers}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
