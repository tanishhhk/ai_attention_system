import "./style.css";
import { drawDetection, heroDetection, initExamples } from "./examples";
import { describeError } from "./errors";
import { LiveSession, type LiveFrame } from "./live";
import { STATE_KEY, STATE_LABEL, checkRows, checksTableMarkup, renderChecks, renderScore, scoreMarkup } from "./readout";
import { STATES, type State } from "./rules";

const $ = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

// ---- Hero: the "focused" photo with the points MediaPipe found in it ----
drawDetection($<SVGSVGElement>("#hero-svg"), heroDetection());

// ---- Examples without a camera ----
initExamples();

// ---- Live check ----
// The panel always keeps its full layout; only the stage message and the numbers change,
// so starting the camera never shifts the page.
const cameraBtn = $<HTMLButtonElement>("#camera-btn");
const stageStart = $<HTMLButtonElement>("#stage-start");
const liveGrid = $("#live-grid");
const liveScore = $("#live-score");
const announce = $("#announce");
liveScore.innerHTML = scoreMarkup;
$("#live-checks").innerHTML = checksTableMarkup("live-tbody");

type LiveState = "idle" | "requesting" | "loading" | "running" | "stopped" | "error";

const STAGE_TEXT: Record<Exclude<LiveState, "running" | "error">, { title: string; detail: string; button?: string }> = {
  idle: { title: "Camera is off", detail: "Press Start camera when you're ready.", button: "Start camera" },
  requesting: { title: "Waiting for camera permission", detail: "Choose Allow in your browser's prompt." },
  loading: { title: "Loading the face and pose models", detail: "About 20 MB the first time. After that it starts almost instantly." },
  stopped: { title: "Camera stopped", detail: "Your results from this session stay below until you start again.", button: "Start again" },
};

const stageCancel = $<HTMLButtonElement>("#stage-cancel");

function setLiveState(state: LiveState, error?: { title: string; detail: string }) {
  liveGrid.dataset.state = state;
  const busy = state === "requesting" || state === "loading";
  cameraBtn.textContent = state === "running" ? "Stop camera" : busy ? "Cancel" : "Start camera";
  stageCancel.hidden = !busy;
  if (state === "running") return;
  const text = state === "error" ? { ...error!, button: "Try again" } : STAGE_TEXT[state];
  $("#stage-title").textContent = text.title;
  $("#stage-detail").textContent = text.detail;
  stageStart.hidden = !text.button;
  if (text.button) stageStart.textContent = text.button;
}

const HISTORY_SECONDS = 60;
let history: number[] = [];
let seconds: Record<State, number> = Object.fromEntries(STATES.map((s) => [s, 0])) as Record<State, number>;
let latest: LiveFrame | null = null;
let lastReadout = 0;
let lastAnnounced: State | null = null;
let secondTimer = 0;

function onFrame(f: LiveFrame) {
  latest = f;
  if (liveGrid.dataset.state !== "running") setLiveState("running");
  const now = performance.now();
  if (now - lastReadout > 200) {
    lastReadout = now;
    renderScore(liveScore, f.result);
    renderChecks($("#live-tbody"), checkRows(f.pose, f.face, f.w, f.h, f.recentYawns), f.result);
  }
}

// History only counts time you can see: a hidden tab pauses detection, so it pauses this too.
let pausedWhileHidden = false;
const pausedNote = document.createElement("p");
pausedNote.className = "live-paused";
pausedNote.hidden = true;
pausedNote.textContent = "History paused while this tab was in the background.";
liveScore.append(pausedNote); // inside the score block, so the grid layout is unchanged
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && pausedWhileHidden && session.running) {
    pausedNote.hidden = false;
    window.setTimeout(() => (pausedNote.hidden = true), 6000);
  }
  if (!document.hidden) pausedWhileHidden = false;
});

function recordSecond() {
  if (!latest) return;
  if (document.hidden) {
    pausedWhileHidden = true;
    return;
  }
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

// Empty readouts before the first start, so the panel has its final shape from the beginning.
renderChecks($("#live-tbody"), checkRows(null, null, 640, 480, null), { score: 0, state: "CRITICAL", issues: [], notes: [] });
drawHistory();
setLiveState("idle");

const session = new LiveSession($<HTMLVideoElement>("#video"), onFrame, (err) => {
  clearInterval(secondTimer);
  latest = null;
  setLiveState("error", describeError(err));
});

async function startCamera() {
  if (session.running || liveGrid.dataset.state === "requesting" || liveGrid.dataset.state === "loading") return;
  try {
    const started = await session.start((phase) => setLiveState(phase));
    if (!started) return; // cancelled
    history = [];
    seconds = Object.fromEntries(STATES.map((s) => [s, 0])) as Record<State, number>;
    lastAnnounced = null;
    drawHistory();
    clearInterval(secondTimer);
    secondTimer = window.setInterval(recordSecond, 1000);
  } catch (err) {
    session.stop();
    setLiveState("error", describeError(err, window.isSecureContext));
  }
}

function stopCamera() {
  session.stop();
  clearInterval(secondTimer);
  latest = null;
  setLiveState("stopped");
}

function cancelStart() {
  session.stop();
  setLiveState("idle");
}

cameraBtn.addEventListener("click", () => {
  const state = liveGrid.dataset.state;
  if (state === "requesting" || state === "loading") cancelStart();
  else if (session.running) stopCamera();
  else startCamera();
});
stageStart.addEventListener("click", () => startCamera());
stageCancel.addEventListener("click", () => cancelStart());

// The hero button scrolls to the panel (smoothly, unless reduced motion is on) and starts the camera.
$("[data-start]").addEventListener("click", (e) => {
  e.preventDefault();
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  $("#live").scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  startCamera();
});
