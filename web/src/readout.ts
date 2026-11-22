// Score, state meter and the six-checks table. Shared by the live panel and the examples.
import type { FacePoints, PosePoints, Result, State } from "./rules";
import {
  EYES_CLOSED_RATIO, FACING_MAX, FACING_MIN, HEAD_FORWARD_RATIO, LEAN_RATIO, PENALTIES,
  SLOUCH_RATIO, YAWN_RATIO, faceMeasures, postureMeasures,
} from "./rules";

export const STATE_LABEL: Record<State, string> = {
  FOCUSED: "Focused",
  ATTENTIVE: "Attentive",
  "LOW ATTENTION": "Low attention",
  DISTRACTED: "Distracted",
  CRITICAL: "Critical",
};

export const STATE_KEY: Record<State, string> = {
  FOCUSED: "focused",
  ATTENTIVE: "attentive",
  "LOW ATTENTION": "low",
  DISTRACTED: "distracted",
  CRITICAL: "critical",
};

type Row = { issue: string; label: string; measure: string; limit: string; value: string };

const fmt = (n: number) => n.toFixed(2);

export function checkRows(pose: PosePoints | null, face: FacePoints | null, w: number, h: number): Row[] {
  const p = postureMeasures(pose, w, h);
  const f = face ? faceMeasures(face, w, h) : null;
  const none = "–";
  return [
    { issue: "Head Forward", label: "Head off-centre", measure: "Sideways offset of the nose ÷ shoulder width", limit: `above ${fmt(HEAD_FORWARD_RATIO)}`, value: p ? fmt(p.offset) : none },
    { issue: "Slouching", label: "Slouching", measure: "Nose height above the shoulders ÷ shoulder width", limit: `below ${fmt(SLOUCH_RATIO)}`, value: p ? fmt(p.rise) : none },
    { issue: "Leaning", label: "Leaning", measure: "Height gap between the shoulders ÷ shoulder width", limit: `above ${fmt(LEAN_RATIO)}`, value: p ? fmt(p.tilt) : none },
    { issue: "Eyes Closed", label: "Eyes closed", measure: "Eyelid gap ÷ eye width, for the more open eye", limit: `below ${fmt(EYES_CLOSED_RATIO)}`, value: f ? fmt(Math.max(f.leftOpen, f.rightOpen)) : none },
    { issue: "Yawning", label: "Yawning", measure: "Lip gap ÷ mouth width", limit: `above ${fmt(YAWN_RATIO)}`, value: f ? fmt(f.mouthOpen) : none },
    { issue: "Looking Away", label: "Looking away", measure: "Where the nose sits between the cheeks", limit: `outside ${fmt(FACING_MIN)}–${fmt(FACING_MAX)}`, value: f ? fmt(f.facing) : none },
  ];
}

export function renderChecks(tbody: HTMLElement, rows: Row[], result: Result) {
  tbody.innerHTML = rows
    .map((r) => {
      const off = result.issues.includes(r.issue);
      return `<tr class="${off ? "is-off" : ""}">
        <th scope="row">${r.label}<span class="check-measure">${r.measure}</span></th>
        <td class="num">${r.value}</td>
        <td>${r.limit}</td>
        <td class="num">${off ? `−${PENALTIES[r.issue]}` : "0"}</td>
      </tr>`;
    })
    .join("");
}

export function renderScore(root: HTMLElement, result: Result) {
  const key = STATE_KEY[result.state];
  root.dataset.state = key;
  root.querySelector<HTMLElement>("[data-score]")!.textContent = String(result.score);
  root.querySelector<HTMLElement>("[data-state]")!.textContent = STATE_LABEL[result.state];
  root.querySelector<HTMLElement>("[data-marker]")!.style.left = `${result.score}%`;

  const notes = [...(result.issues.includes("No Face Detected") ? ["No face in view."] : []), ...result.notes];
  const noteEl = root.querySelector<HTMLElement>("[data-notes]");
  if (noteEl) noteEl.textContent = notes.join(" ");
}

export const scoreMarkup = `
  <div class="score-figure"><span class="score-num" data-score>–</span><span class="score-of">/100</span></div>
  <p class="score-state" data-state>–</p>
  <div class="meter" aria-hidden="true">
    <div class="meter-bands">
      <span data-band="critical">Critical</span><span data-band="distracted">Distracted</span><span data-band="low">Low</span><span data-band="attentive">Attentive</span><span data-band="focused">Focused</span>
    </div>
    <span class="meter-marker" data-marker></span>
  </div>
  <p class="score-notes" data-notes></p>`;

export const checksTableMarkup = (id: string) => `
  <table class="checks">
    <caption class="visually-hidden">The six checks and their current values</caption>
    <thead><tr><th scope="col">Check</th><th scope="col" class="num">Value</th><th scope="col">Trips when</th><th scope="col" class="num">Points</th></tr></thead>
    <tbody id="${id}"></tbody>
  </table>`;
