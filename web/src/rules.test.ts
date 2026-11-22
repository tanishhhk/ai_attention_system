import { describe, expect, it } from "vitest";
import { build, cases } from "./cases";
import { evaluate } from "./rules";

describe("shared rule cases (same file as tests/test_rules.py)", () => {
  it.each(cases.map((c) => [c.id, c] as const))("%s", (_id, c) => {
    const f = build(c);
    expect(evaluate(f.pose, f.face, f.w, f.h)).toEqual(c.expect);
  });
});
