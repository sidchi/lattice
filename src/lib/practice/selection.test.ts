import { describe, expect, it } from "vitest";

import { sampleQuestions, sessionTimeLimit } from "./selection";
import { MAX_SESSION_SEC } from "./timer";

const pool = ["a", "b", "c", "d", "e"].map((id) => ({ id, timeLimitSec: 600 }));
const ids = (items: { id: string }[]) => items.map((item) => item.id);

/** A deterministic random source that replays the given values. */
function replay(...values: number[]) {
  let i = 0;
  return () => values[i++ % values.length]!;
}

describe("sampleQuestions", () => {
  it("draws distinct items in the order the random source picks them", () => {
    // i=0 picks index 0+floor(0.99*5)=4 ("e"); i=1 picks 1+floor(0*4)=1 ("b").
    expect(ids(sampleQuestions(pool, 2, replay(0.99, 0)))).toEqual(["e", "b"]);
  });

  it("with random() = 0 keeps the input order", () => {
    expect(ids(sampleQuestions(pool, 3, () => 0))).toEqual(["a", "b", "c"]);
  });

  it("never returns duplicates, for any random source", () => {
    for (let seed = 0; seed < 50; seed++) {
      const random = replay(((seed * 7919) % 100) / 100, ((seed * 104729) % 100) / 100);
      const picked = ids(sampleQuestions(pool, 3, random));
      expect(new Set(picked).size).toBe(3);
    }
  });

  it("returns every candidate when fewer than requested", () => {
    expect(ids(sampleQuestions(pool.slice(0, 2), 3, () => 0)).sort()).toEqual(["a", "b"]);
  });

  it("handles empty input and non-positive counts", () => {
    expect(sampleQuestions([], 3)).toEqual([]);
    expect(sampleQuestions(pool, 0)).toEqual([]);
    expect(sampleQuestions(pool, -1)).toEqual([]);
  });

  it("does not modify its input", () => {
    const input = [...pool];
    sampleQuestions(input, 3, () => 0.5);
    expect(input).toEqual(pool);
  });

  it("is roughly uniform", () => {
    const counts = new Map<string, number>();
    let state = 42;
    // Small LCG: deterministic, but well spread for this purpose.
    const random = () => (state = (state * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    for (let i = 0; i < 5000; i++) {
      const [first] = sampleQuestions(pool, 1, random);
      counts.set(first!.id, (counts.get(first!.id) ?? 0) + 1);
    }
    for (const id of ids(pool)) {
      expect(counts.get(id)).toBeGreaterThan(850);
      expect(counts.get(id)).toBeLessThan(1150);
    }
  });
});

describe("sessionTimeLimit", () => {
  it("sums the questions' limits", () => {
    expect(sessionTimeLimit(pool.slice(0, 3))).toBe(1800);
  });

  it("caps very long sessions", () => {
    const long = [1, 2, 3].map((n) => ({ id: String(n), timeLimitSec: 2 * 60 * 60 }));
    expect(sessionTimeLimit(long)).toBe(MAX_SESSION_SEC);
  });

  it("ignores negative limits", () => {
    expect(sessionTimeLimit([{ id: "x", timeLimitSec: -60 }, pool[0]!])).toBe(600);
  });
});
