// Draws a box around the detected face with the score and state, over a photo (SVG).
// The box comes from the face points MediaPipe found; its colour follows the state.
import { STATE_KEY, STATE_LABEL } from "./readout";
import type { FacePoints, Result } from "./rules";

export const VIEW_W = 640;

const LABEL_H = 30;
const FONT = 17;

// Rough text width for the label background (Archivo, bold, at FONT px).
const textWidth = (s: string) => s.length * FONT * 0.6;

function faceBox(face: FacePoints, vh: number) {
  const left = Math.min(face.cheek_l.x, face.cheek_r.x) * VIEW_W;
  const right = Math.max(face.cheek_l.x, face.cheek_r.x) * VIEW_W;
  const width = right - left;
  const eyes = ((face.eye_l_top.y + face.eye_r_top.y) / 2) * vh;
  const mouth = face.lip_bottom.y * vh;
  const height = width * 1.3;
  const top = (eyes + mouth) / 2 - height * 0.5;
  const pad = width * 0.1;
  return { x: left - pad, y: top - pad, w: width + pad * 2, h: height + pad * 2 };
}

export function faceBoxMarkup(face: FacePoints | null, aspect: number, result: Result): string {
  const vh = VIEW_W * aspect;
  const label = face ? `${result.score}% ${STATE_LABEL[result.state]}` : `No face ${result.score}%`;
  const labelW = textWidth(label) + 20;

  if (!face) {
    return `<g class="facebox" data-state="${STATE_KEY[result.state]}">
      <rect class="facebox-tag" x="16" y="16" width="${labelW}" height="${LABEL_H}" rx="4"/>
      <text class="facebox-text" x="26" y="${16 + LABEL_H / 2}" font-size="${FONT}">${label}</text>
    </g>`;
  }

  const b = faceBox(face, vh);
  const x = Math.max(4, Math.min(b.x, VIEW_W - b.w - 4));
  const y = Math.max(LABEL_H + 4, b.y);
  const tagX = Math.max(4, Math.min(x, VIEW_W - labelW - 4));
  return `<g class="facebox" data-state="${STATE_KEY[result.state]}">
    <rect class="facebox-frame" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${b.w.toFixed(1)}" height="${b.h.toFixed(1)}" rx="6"/>
    <rect class="facebox-tag" x="${tagX.toFixed(1)}" y="${(y - LABEL_H).toFixed(1)}" width="${labelW.toFixed(1)}" height="${LABEL_H}" rx="4"/>
    <text class="facebox-text" x="${(tagX + 10).toFixed(1)}" y="${(y - LABEL_H / 2).toFixed(1)}" font-size="${FONT}">${label}</text>
  </g>`;
}

export function setFaceBox(svg: SVGSVGElement, face: FacePoints | null, aspect: number, result: Result) {
  svg.setAttribute("viewBox", `0 0 ${VIEW_W} ${(VIEW_W * aspect).toFixed(1)}`);
  svg.innerHTML = faceBoxMarkup(face, aspect, result);
}
