import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { SessionScorePoint } from "@/lib/history/progress";

import { pointLabel, ScoreTrendChart } from "./score-trend-chart";

const point = (day: number, averageScore: number, scoredAnswers = 1): SessionScorePoint => ({
  sessionId: `s${day}`,
  submittedAt: new Date(Date.UTC(2026, 10, day, 12)),
  averageScore,
  scoredAnswers,
});

describe("ScoreTrendChart", () => {
  it("describes the series for assistive technology", () => {
    render(<ScoreTrendChart points={[point(1, 2), point(8, 3.5, 2)]} />);
    expect(screen.getByRole("img")).toHaveAccessibleName(
      "Average score per session. 2 sessions from Nov 1, 2026 to Nov 8, 2026. Latest average 3.5 out of 5.",
    );
  });

  it("renders one marker per session with a tooltip, and a line", () => {
    const { container } = render(<ScoreTrendChart points={[point(1, 2), point(8, 3.5, 2)]} />);
    const markers = screen.getAllByTestId("trend-point");
    expect(markers).toHaveLength(2);
    expect(markers[1]?.querySelector("title")).toHaveTextContent(
      "Nov 8, 2026: 3.5 / 5 (2 answers)",
    );
    expect(container.querySelector("path")).toHaveAttribute(
      "d",
      expect.stringMatching(/^M.+ L.+$/),
    );
  });

  it("offers the same numbers as a table, newest first", () => {
    render(<ScoreTrendChart points={[point(1, 2), point(8, 3.5, 2)]} />);
    const rows = within(screen.getByRole("table", { hidden: true })).getAllByRole("row", {
      hidden: true,
    });
    expect(rows.map((row) => row.textContent)).toEqual([
      "SubmittedAverage scoreScored answers",
      "Nov 8, 20263.52",
      "Nov 1, 20262.01",
    ]);
  });

  it("draws a single session as a lone marker", () => {
    const { container } = render(<ScoreTrendChart points={[point(1, 4)]} />);
    expect(screen.getAllByTestId("trend-point")).toHaveLength(1);
    expect(container.querySelector("path")).toBeNull();
  });
});

describe("pointLabel", () => {
  it("uses the singular for one answer", () => {
    expect(pointLabel(point(3, 4))).toBe("Nov 3, 2026: 4.0 / 5 (1 answer)");
  });
});
