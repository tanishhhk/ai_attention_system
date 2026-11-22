import "./style.css";
import { build, cases } from "./cases";
import { setFigure } from "./figure";
import { LiveSession, cameraErrorMessage, type LiveFrame } from "./live";
import { STATE_KEY, STATE_LABEL, checkRows, checksTableMarkup, renderChecks, renderScore, scoreMarkup } from "./readout";
import { STATES, evaluate, type State } from "./rules";

const $ = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

// ---- Hero: the focused example, drawn from the shared cases ----
const focused = build(cases.find((c) => c.id === "focused")!);
setFigure($<SVGSVGElement>("#hero-svg"), { pose: focused.pose, face: focused.face, aspect: focused.h / focused.w, issues: [] });

// ---- Examples ----
const demos = cases.filter((c) => c.demo);
const scenarioRoot = $("#scenarios");
const exampleScore = $("#example-score");
exampleScore.innerHTML = scoreMarkup;
$("#example-checks").innerHTML = checksTableMarkup("example-tbody");

function showExample(id: string) {
  const c = demos.find((d) => d.id === id)!;
  const f = build(c);
  const result = evaluate(f.pose, f.face, f.w, f.h);
  setFigure($<SVGSVGElement>("#example-svg"), { pose: f.pose, face: f.face, aspect: f.h / f.w, issues: result.issues, alignFace: true });
  $("#example-desc").textContent = c.demo!.description;
  renderScore(exampleScore, result);
  renderChecks($("#example-tbody"), checkRows(f.pose, f.face, f.w, f.h), result);
  scenarioRoot.querySelectorAll<HTMLButtonElement>("button").forEach((b) => {
    const on = b.dataset.id === id;
    b.setAttribute("aria-checked", String(on));
    b.tabIndex = on ? 0 : -1;
  });
}

scenarioRoot.innerHTML = demos
  .map((d) => `<button type="button" role="radio" data-id="${d.id}">${d.demo!.label}</button>`)
  .join("");
scenarioRoot.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-id]");
  if (btn) showExample(btn.dataset.id!);
});
scenarioRoot.addEventListener("keydown", (e) => {
  if (!["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(e.key)) return;
  e.preventDefault();
  const buttons = [...scenarioRoot.querySelectorAll<HTMLButtonElement>("button")];
  const i = buttons.findIndex((b) => b.getAttribute("aria-checked") === "true");
  const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
  const next = buttons[(i + step + buttons.length) % buttons.length];
  showExample(next.dataset.id!);
  next.focus();
});
showExample("drowsy_slump");

// ---- Live check ----
const cameraBtn = $<HTMLButtonElement>("#camera-btn");
const statusEl = $("#camera-status");
const liveGrid = $("#live-grid");
const liveScore = $("#live-score");
const liveSvg = $<SVGSVGElement>("#live-svg");
const announce = $("#announce");
liveScore.innerHTML = scoreMarkup;
$("#live-checks").innerHTML = checksTableMarkup("live-tbody");

const HISTORY_SECONDS = 60;
let history: number[] = [];
let seconds: Record<State, number> = Object.fromEntries(STATES.map((s) => [s, 0])) as Record<State, number>;
let latest: LiveFrame | null = null;
let lastReadout = 0;
let lastAnnounced: State | null = null;
let secondTimer = 0;

function onFrame(f: LiveFrame) {
  latest = f;
  setFigure(liveSvg, { pose: f.pose, face: f.face, aspect: f.h / f.w, issues: f.result.issues });
  const now = performance.now();
  if (now - lastReadout > 200) {
    lastReadout = now;
    renderScore(liveScore, f.result);
    renderChecks($("#live-tbody"), checkRows(f.pose, f.face, f.w, f.h), f.result);
  }
}

function recordSecond() {
  if (!latest) return;
  const { score, state } = latest.result;
  history = [...history, score].slice(-HISTORY_SECONDS);
  seconds[state] += 1;
  drawHistory();
  if (state !== lastAnnounced) {
    lastAnnounced = state;
    announce.textContent = `${STATE_LABEL[state]}, score ${score}`;
  }
}

function drawHistory() {
  const spark = $<SVGSVGElement>("#spark");
  const step = 300 / (HISTORY_SECONDS - 1);
  const offset = (HISTORY_SECONDS - history.length) * step;
  const y = (score: number) => (96 - score * 0.92).toFixed(1); // 4px padding so 0 and 100 stay visible
  const pts = history.map((s, i) => `${(offset + i * step).toFixed(1)},${y(s)}`).join(" ");
  const grid = [20, 40, 60, 80].map((g) => `<line class="spark-grid" x1="0" x2="300" y1="${y(g)}" y2="${y(g)}"/>`).join("");
  spark.innerHTML = `${grid}<polyline class="spark-line" points="${pts}"/>`;

  const total = Object.values(seconds).reduce((a, b) => a + b, 0) || 1;
  $("#shares").innerHTML = STATES.map((s) => {
    const pct = Math.round((seconds[s] / total) * 100);
    return `<div class="share" data-state="${STATE_KEY[s]}"><dt>${STATE_LABEL[s]}</dt><dd><span class="share-bar" style="width:${pct}%"></span><span class="num">${pct}%</span></dd></div>`;
  }).join("");
}

const session = new LiveSession($<HTMLVideoElement>("#video"), onFrame);

async function startCamera() {
  if (session.running) return;
  cameraBtn.disabled = true;
  try {
    await session.start((msg) => (statusEl.textContent = msg));
    history = [];
    seconds = Object.fromEntries(STATES.map((s) => [s, 0])) as Record<State, number>;
    lastAnnounced = null;
    liveGrid.hidden = false;
    drawHistory();
    secondTimer = window.setInterval(recordSecond, 1000);
    cameraBtn.textContent = "Stop camera";
  } catch (err) {
    session.stop();
    statusEl.textContent = cameraErrorMessage(err);
  } finally {
    cameraBtn.disabled = false;
  }
}

function stopCamera() {
  session.stop();
  clearInterval(secondTimer);
  latest = null;
  cameraBtn.textContent = "Start camera";
  statusEl.textContent = "Camera stopped. Your results from this session stay on screen until you start again.";
}

cameraBtn.addEventListener("click", () => (session.running ? stopCamera() : startCamera()));
$("[data-start]").addEventListener("click", () => {
  startCamera();
});
