import data from "../../shared/rules_cases.json";
import type { FacePoints, PosePoints, Result } from "./rules";

type Patch<T> = Partial<T> | null;

export type Case = {
  id: string;
  w?: number;
  h?: number;
  pose?: Patch<PosePoints>;
  face?: Patch<FacePoints>;
  demo?: { label: string; description: string };
  expect: Result;
};

export type Frame = { pose: PosePoints | null; face: FacePoints | null; w: number; h: number };

export const cases = data.cases as Case[];

// Same merge as tests/test_rules.py: case entries replace whole named points.
export function build(c: Case): Frame {
  const base = data.base as Frame;
  const pose = c.pose === null ? null : ({ ...base.pose, ...(c.pose ?? {}) } as PosePoints);
  const face = c.face === null ? null : ({ ...base.face, ...(c.face ?? {}) } as FacePoints);
  return { pose, face, w: c.w ?? base.w, h: c.h ?? base.h };
}
