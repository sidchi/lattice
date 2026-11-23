/** Static product metadata shared by pages, metadata exports and tests. */
export const site = {
  name: "Lattice",
  tagline: "Practice the interview, not just the questions.",
  description:
    "Timed mock interviews across system design, behavioral and coding questions, with rubric-based AI feedback and progress tracking.",
} as const;

export type PracticeTrack = {
  slug: "system-design" | "behavioral" | "coding";
  title: string;
  summary: string;
};

/** The three practice tracks the question bank is organized around. */
export const practiceTracks: readonly PracticeTrack[] = [
  {
    slug: "system-design",
    title: "System design",
    summary: "Scope requirements, sketch components, and defend trade-offs under time pressure.",
  },
  {
    slug: "behavioral",
    title: "Behavioral",
    summary:
      "Structure STAR answers about ownership, conflict and impact, and tighten them over time.",
  },
  {
    slug: "coding",
    title: "Coding",
    summary: "Reason aloud about approach and complexity before you write a line.",
  },
];
