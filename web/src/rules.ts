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
export const SLOUCH_RATIO = 0.4; // upright photos 0.46-0.65, slouched 0.33-0.37
export const LEAN_RATIO = 0.15;
export const EYES_CLOSED_RATIO = 0.15;
export const YAWN_RATIO = 0.4;
export const FACING_MIN = 0.3;
export const FACING_MAX = 0.7;

// Any single tripped check drops the score to 80 or below, out of "Focused".
export const PENALTIES: Record<string, number> = {
  "Head Forward": 20,
  Slouching: 20,
  Leaning: 20,
  "Eyes Closed": 30,
  Yawning: 20,
  "Looking Away": 20,
  "Frequent Yawning": 20,
};

// A yawn counts once the mouth stays open past YAWN_RATIO this long (talking doesn't).
export const YAWN_MIN_SECONDS = 1;
// This many counted yawns within the window adds "Frequent Yawning", even between yawns.
export const FREQUENT_YAWNS = 2;
export const YAWN_WINDOW_SECONDS = 60;

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

const inFrame = (p: Point) => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;

// MediaPipe guesses off-frame shoulders with high visibility, so check the frame too.
export function shouldersVisible(pose: PosePoints | null): pose is PosePoints {
  if (pose === null) return false;
  const { left_shoulder: l, right_shoulder: r } = pose;
  return Math.min(l.v ?? 1, r.v ?? 1) >= MIN_SHOULDER_VISIBILITY && inFrame(l) && inFrame(r);
}

// Null when the shoulders can't be trusted, so posture is skipped.
export function postureMeasures(pose: PosePoints | null, w: number, h: number) {
  if (!shouldersVisible(pose)) return null;

  const { left_shoulder: l, right_shoulder: r, nose } = pose;

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

// Counts yawns over time. Feed it every frame: update(seconds, result.issues.includes("Yawning")).
export class YawnTracker {
  private openSince: number | null = null;
  private counted = false;
  private yawns: number[] = [];

  update(t: number, yawning: boolean): number {
    if (yawning) {
      if (this.openSince === null) {
        this.openSince = t;
        this.counted = false;
      }
      if (!this.counted && t - this.openSince >= YAWN_MIN_SECONDS) {
        this.yawns.push(t);
        this.counted = true;
      }
    } else {
      this.openSince = null;
    }
    this.yawns = this.yawns.filter((y) => t - y <= YAWN_WINDOW_SECONDS);
    return this.yawns.length;
  }
}

// Add the Frequent Yawning check to one frame's result.
export function addHistory(result: Result, recentYawns: number): Result {
  if (recentYawns < FREQUENT_YAWNS || result.issues.includes(NO_FACE)) return result;
  const issues = [...result.issues, "Frequent Yawning"];
  const score = Math.max(0, 100 - issues.reduce((sum, i) => sum + PENALTIES[i], 0));
  return { ...result, score, state: stateFor(score), issues };
}
