// Mirror of src/rules.py. Keep the two in step: both run shared/rules_cases.json.
// Every threshold is a ratio of two distances in the same frame, so the result
// does not depend on camera resolution.

export type Point = { x: number; y: number; v?: number };
export type PosePoints = Record<(typeof POSE_POINTS)[number], Point>;
export type FacePoints = Record<(typeof FACE_POINTS)[number], Point>;
export type State = "FOCUSED" | "ATTENTIVE" | "LOW ATTENTION" | "DISTRACTED" | "CRITICAL";
export type Result = { score: number; state: State; issues: string[]; notes: string[] };

export const MIN_SHOULDER_VISIBILITY = 0.5;
export const HEAD_FORWARD_RATIO = 0.2;
export const SLOUCH_RATIO = 0.25;
export const LEAN_RATIO = 0.15;
export const EYES_CLOSED_RATIO = 0.15;
export const YAWN_RATIO = 0.4;
export const FACING_MIN = 0.3;
export const FACING_MAX = 0.7;

export const PENALTIES: Record<string, number> = {
  "Head Forward": 20,
  Slouching: 20,
  Leaning: 15,
  "Eyes Closed": 30,
  Yawning: 15,
  "Looking Away": 20,
};

export const NO_FACE = "No Face Detected";
export const SHOULDERS_HIDDEN_NOTE = "Shoulders not in view: posture not checked";
export const STATES: State[] = ["FOCUSED", "ATTENTIVE", "LOW ATTENTION", "DISTRACTED", "CRITICAL"];

export const POSE_POINTS = ["nose", "left_shoulder", "right_shoulder"] as const;
export const FACE_POINTS = [
  "eye_l_top", "eye_l_bottom", "eye_l_outer", "eye_l_inner",
  "eye_r_top", "eye_r_bottom", "eye_r_inner", "eye_r_outer",
  "lip_top", "lip_bottom", "mouth_l", "mouth_r",
  "nose_tip", "cheek_l", "cheek_r",
] as const;

const dist = (a: Point, b: Point, w: number, h: number) =>
  Math.hypot((a.x - b.x) * w, (a.y - b.y) * h);

const ratio = (num: number, den: number) => (den > 0 ? num / den : 0);

// Null when the shoulders can't be trusted, so posture is skipped.
export function postureMeasures(pose: PosePoints | null, w: number, h: number) {
  if (pose === null) return null;

  const { left_shoulder: l, right_shoulder: r, nose } = pose;
  if (Math.min(l.v ?? 1, r.v ?? 1) < MIN_SHOULDER_VISIBILITY) return null;

  const shoulderWidth = dist(l, r, w, h);
  const midX = ((l.x + r.x) / 2) * w;
  const midY = ((l.y + r.y) / 2) * h;
  return {
    offset: ratio(Math.abs(nose.x * w - midX), shoulderWidth),
    rise: ratio(midY - nose.y * h, shoulderWidth),
    tilt: ratio(Math.abs(l.y - r.y) * h, shoulderWidth),
  };
}

export function postureIssues(pose: PosePoints | null, w: number, h: number): [string[], string[]] {
  const m = postureMeasures(pose, w, h);
  if (m === null) return [[], [SHOULDERS_HIDDEN_NOTE]];

  const issues: string[] = [];
  if (m.offset > HEAD_FORWARD_RATIO) issues.push("Head Forward");
  if (m.rise < SLOUCH_RATIO) issues.push("Slouching");
  if (m.tilt > LEAN_RATIO) issues.push("Leaning");
  return [issues, []];
}

export function faceMeasures(face: FacePoints, w: number, h: number) {
  const leftOpen = ratio(dist(face.eye_l_top, face.eye_l_bottom, w, h), dist(face.eye_l_outer, face.eye_l_inner, w, h));
  const rightOpen = ratio(dist(face.eye_r_top, face.eye_r_bottom, w, h), dist(face.eye_r_inner, face.eye_r_outer, w, h));
  const mouthOpen = ratio(dist(face.lip_top, face.lip_bottom, w, h), dist(face.mouth_l, face.mouth_r, w, h));
  const leftX = Math.min(face.cheek_l.x, face.cheek_r.x);
  const rightX = Math.max(face.cheek_l.x, face.cheek_r.x);
  const facing = ratio(face.nose_tip.x - leftX, rightX - leftX);
  return { leftOpen, rightOpen, mouthOpen, facing };
}

export function faceIssues(face: FacePoints, w: number, h: number): string[] {
  const m = faceMeasures(face, w, h);
  const issues: string[] = [];
  if (m.leftOpen < EYES_CLOSED_RATIO && m.rightOpen < EYES_CLOSED_RATIO) issues.push("Eyes Closed");
  if (m.mouthOpen > YAWN_RATIO) issues.push("Yawning");
  if (m.facing < FACING_MIN || m.facing > FACING_MAX) issues.push("Looking Away");
  return issues;
}

export function stateFor(score: number): State {
  if (score > 80) return "FOCUSED";
  if (score > 60) return "ATTENTIVE";
  if (score > 40) return "LOW ATTENTION";
  if (score > 20) return "DISTRACTED";
  return "CRITICAL";
}

export function evaluate(pose: PosePoints | null, face: FacePoints | null, w: number, h: number): Result {
  if (face === null) return { score: 0, state: stateFor(0), issues: [NO_FACE], notes: [] };

  const [issues, notes] = postureIssues(pose, w, h);
  issues.push(...faceIssues(face, w, h));
  const score = Math.max(0, 100 - issues.reduce((sum, i) => sum + PENALTIES[i], 0));
  return { score, state: stateFor(score), issues, notes };
}
