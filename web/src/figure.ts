// Draws the landmarks the rules see as a schematic figure (SVG).
// Used for the hero, the examples and the live camera overlay.
import type { FacePoints, Point, PosePoints } from "./rules";
import { MIN_SHOULDER_VISIBILITY } from "./rules";

export const VIEW_W = 640;

type FigureInput = {
  pose: PosePoints | null;
  face: FacePoints | null;
  aspect: number; // height / width of the frame
  issues: string[];
  // Examples move body and face points separately; draw the face on the body's nose.
  alignFace?: boolean;
};

// Head outline: an oval spanning the cheeks, a little taller than wide.
function headOval(f: FacePoints, vh: number) {
  const left = Math.min(f.cheek_l.x, f.cheek_r.x);
  const right = Math.max(f.cheek_l.x, f.cheek_r.x);
  const rx = ((right - left) / 2) * VIEW_W;
  const ry = rx * 1.3;
  return { cx: ((left + right) / 2) * VIEW_W, cy: ((f.cheek_l.y + f.cheek_r.y) / 2) * vh + ry * 0.15, rx, ry };
}

function chin(f: FacePoints, vh: number) {
  const o = headOval(f, vh);
  return { x: o.cx, y: o.cy + o.ry };
}

const has = (issues: string[], ...names: string[]) => names.some((n) => issues.includes(n));

function shiftFace(face: FacePoints, dx: number, dy: number): FacePoints {
  return Object.fromEntries(
    Object.entries(face).map(([k, p]) => [k, { x: p.x + dx, y: p.y + dy }]),
  ) as FacePoints;
}

export function figureMarkup({ pose, face: rawFace, aspect, issues, alignFace }: FigureInput): string {
  const face =
    alignFace && pose && rawFace
      ? shiftFace(rawFace, pose.nose.x - rawFace.nose_tip.x, pose.nose.y - rawFace.nose_tip.y)
      : rawFace;
  const vh = VIEW_W * aspect;
  const X = (p: Point) => (p.x * VIEW_W).toFixed(1);
  const Y = (p: Point) => (p.y * vh).toFixed(1);
  const parts: string[] = [];
  const dots: Point[] = [];

  if (pose) {
    const { left_shoulder: l, right_shoulder: r, nose } = pose;
    const hidden = Math.min(l.v ?? 1, r.v ?? 1) < MIN_SHOULDER_VISIBILITY;
    const mid = { x: (l.x + r.x) / 2, y: (l.y + r.y) / 2 };
    if (hidden) {
      parts.push(`<line class="fig-hidden" x1="${X(l)}" y1="${Y(l)}" x2="${X(r)}" y2="${Y(r)}"/>`);
    } else {
      const sh = has(issues, "Leaning", "Slouching") ? " is-off" : "";
      const neck = has(issues, "Head Forward", "Slouching") ? " is-off" : "";
      const top = face ? chin(face, vh) : { x: nose.x * VIEW_W, y: nose.y * vh };
      // A head sunk below the shoulder line hides the neck, as it would on camera.
      if (top.y < mid.y * vh) {
        parts.push(`<line class="fig-line${neck}" x1="${X(mid)}" y1="${Y(mid)}" x2="${top.x.toFixed(1)}" y2="${top.y.toFixed(1)}"/>`);
      }
      parts.push(`<line class="fig-line${sh}" x1="${X(l)}" y1="${Y(l)}" x2="${X(r)}" y2="${Y(r)}"/>`);
      dots.push(l, r, nose);
    }
  }

  if (face) {
    const f = face;
    const { cx, cy, rx, ry } = headOval(f, vh);
    const away = has(issues, "Looking Away") ? " is-off" : "";
    parts.push(`<ellipse class="fig-line fig-head${away}" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}"/>`);

    const oval = (a: Point, b: Point, top: Point, bottom: Point, off: boolean) => {
      const ex = ((a.x + b.x) / 2) * VIEW_W;
      const ey = ((top.y + bottom.y) / 2) * vh;
      const erx = Math.max((Math.abs(a.x - b.x) / 2) * VIEW_W, 1);
      const ery = Math.max((Math.abs(top.y - bottom.y) / 2) * vh, 0.8);
      return `<ellipse class="fig-line${off ? " is-off" : ""}" cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" rx="${erx.toFixed(1)}" ry="${ery.toFixed(1)}"/>`;
    };
    const eyesOff = has(issues, "Eyes Closed");
    parts.push(oval(f.eye_l_outer, f.eye_l_inner, f.eye_l_top, f.eye_l_bottom, eyesOff));
    parts.push(oval(f.eye_r_inner, f.eye_r_outer, f.eye_r_top, f.eye_r_bottom, eyesOff));
    parts.push(oval(f.mouth_l, f.mouth_r, f.lip_top, f.lip_bottom, has(issues, "Yawning")));
    dots.push(...Object.values(f));
  }

  const dotMarkup = dots.map((p) => `<circle class="fig-dot" cx="${X(p)}" cy="${Y(p)}" r="3.2"/>`).join("");
  return `<g>${parts.join("")}${dotMarkup}</g>`;
}

export function setFigure(svg: SVGSVGElement, input: FigureInput) {
  svg.setAttribute("viewBox", `0 0 ${VIEW_W} ${(VIEW_W * input.aspect).toFixed(1)}`);
  svg.innerHTML = figureMarkup(input);
}
