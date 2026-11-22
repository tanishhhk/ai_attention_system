import { describe, expect, it } from "vitest";
import { build, cases, historyCases, yawnSequences } from "./cases";
import { YawnTracker, addHistory, evaluate } from "./rules";

const byId = (id: string) => cases.find((c) => c.id === id)!;

describe("shared rule cases (same file as tests/test_rules.py)", () => {
  it.each(cases.map((c) => [c.id, c] as const))("%s", (_id, c) => {
    const f = build(c);
    expect(evaluate(f.pose, f.face, f.w, f.h)).toEqual(c.expect);
  });
});

describe("frequent yawning history", () => {
  it.each(historyCases.map((h) => [h.id, h] as const))("%s", (_id, h) => {
    const f = build(byId(h.case));
    expect(addHistory(evaluate(f.pose, f.face, f.w, f.h), h.recent_yawns)).toEqual(h.expect);
  });
});

describe("yawn tracker", () => {
  it.each(yawnSequences.map((s) => [s.id, s] as const))("%s", (_id, s) => {
    const tracker = new YawnTracker();
    expect(s.frames.map(([t, yawning]) => tracker.update(t, yawning))).toEqual(s.counts);
  });
});
