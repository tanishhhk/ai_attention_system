import "./style.css";
import { drawDetection, heroDetection, initExamples } from "./examples";
import { setFigure } from "./figure";
import { LiveSession, cameraErrorMessage, type LiveFrame } from "./live";
import { STATE_KEY, STATE_LABEL, checkRows, checksTableMarkup, renderChecks, renderScore, scoreMarkup } from "./readout";
import { STATES, type State } from "./rules";

const $ = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

// ---- Hero: the "focused" photo with the points MediaPipe found in it ----
drawDetection($<SVGSVGElement>("#hero-svg"), heroDetection());

// ---- Examples without a camera ----
initExamples();

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
    renderChecks($("#live-tbody"), checkRows(f.pose, f.face, f.w, f.h, f.recentYawns), f.result);
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
