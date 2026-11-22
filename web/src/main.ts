import "./style.css";
import { drawDetection, heroDetection, initExamples } from "./examples";
import { LiveSession, cameraErrorMessage, type LiveFrame } from "./live";
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

const STAGE_TEXT: Record<Exclude<LiveState, "running">, { title: string; detail: string; button?: string }> = {
  idle: { title: "Camera is off", detail: "Press Start camera when you're ready.", button: "Start camera" },
  requesting: { title: "Waiting for camera permission", detail: "Choose Allow in your browser's prompt." },
  loading: { title: "Loading the face and pose models", detail: "About 20 MB the first time. After that it starts almost instantly." },
  stopped: { title: "Camera stopped", detail: "Your results from this session stay below until you start again.", button: "Start again" },
  error: { title: "The camera didn't start", detail: "", button: "Try again" },
};

function setLiveState(state: LiveState, errorDetail = "") {
  liveGrid.dataset.state = state;
  const busy = state === "requesting" || state === "loading";
  cameraBtn.disabled = busy;
  cameraBtn.textContent = state === "running" ? "Stop camera" : "Start camera";
  if (state === "running") return;
  const text = STAGE_TEXT[state];
  $("#stage-title").textContent = text.title;
  $("#stage-detail").textContent = state === "error" ? errorDetail : text.detail;
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

// Empty readouts before the first start, so the panel has its final shape from the beginning.
renderChecks($("#live-tbody"), checkRows(null, null, 640, 480, null), { score: 0, state: "CRITICAL", issues: [], notes: [] });
drawHistory();
setLiveState("idle");

const session = new LiveSession($<HTMLVideoElement>("#video"), onFrame);

async function startCamera() {
  if (session.running || cameraBtn.disabled) return;
  try {
    await session.start((phase) => setLiveState(phase));
    history = [];
    seconds = Object.fromEntries(STATES.map((s) => [s, 0])) as Record<State, number>;
    lastAnnounced = null;
    drawHistory();
    secondTimer = window.setInterval(recordSecond, 1000);
  } catch (err) {
    session.stop();
    setLiveState("error", cameraErrorMessage(err));
  }
}

function stopCamera() {
  session.stop();
  clearInterval(secondTimer);
  latest = null;
  setLiveState("stopped");
}

cameraBtn.addEventListener("click", () => (session.running ? stopCamera() : startCamera()));
stageStart.addEventListener("click", () => startCamera());

// The hero button scrolls to the panel (smoothly, unless reduced motion is on) and starts the camera.
$("[data-start]").addEventListener("click", (e) => {
  e.preventDefault();
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  $("#live").scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  startCamera();
});
