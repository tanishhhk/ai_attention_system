// Webcam + MediaPipe landmarkers, all in the browser. Frames are never uploaded.
import { FaceLandmarker, FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import type { FacePoints, PosePoints, Result } from "./rules";
import { LiveError, TimeoutError, withTimeout } from "./errors";
import { YawnTracker, addHistory, evaluate } from "./rules";

const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm";
const FACE_MODEL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const POSE_MODEL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

// Same indices as src/detector.py.
const POSE_INDEX = { nose: 0, left_shoulder: 11, right_shoulder: 12 } as const;
const FACE_INDEX = {
  eye_l_top: 159, eye_l_bottom: 145, eye_l_outer: 33, eye_l_inner: 133,
  eye_r_top: 386, eye_r_bottom: 374, eye_r_inner: 362, eye_r_outer: 263,
  lip_top: 13, lip_bottom: 14, mouth_l: 61, mouth_r: 291,
  nose_tip: 1, cheek_l: 234, cheek_r: 454,
} as const;

export type LiveFrame = { pose: PosePoints | null; face: FacePoints | null; w: number; h: number; result: Result; recentYawns: number };

let landmarkers: Promise<{ face: FaceLandmarker; pose: PoseLandmarker }> | null = null;

async function create(delegate: "GPU" | "CPU") {
  const files = await FilesetResolver.forVisionTasks(WASM);
  const [face, pose] = await Promise.all([
    FaceLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: FACE_MODEL, delegate },
      runningMode: "VIDEO",
      numFaces: 1,
    }),
    PoseLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: POSE_MODEL, delegate },
      runningMode: "VIDEO",
      numPoses: 1,
    }),
  ]);
  return { face, pose };
}

function loadLandmarkers() {
  landmarkers ??= create("GPU").catch(() => create("CPU"));
  landmarkers.catch(() => (landmarkers = null)); // allow a retry after a network failure
  return landmarkers;
}

const pick = <K extends string>(lm: NormalizedLandmark[], index: Record<K, number>, withVis: boolean) =>
  Object.fromEntries(
    Object.entries(index).map(([name, i]) => {
      const p = lm[i as number];
      return [name, withVis ? { x: p.x, y: p.y, v: p.visibility } : { x: p.x, y: p.y }];
    }),
  ) as Record<K, { x: number; y: number; v?: number }>;

// Give up on the model download after this long; a retry reuses whatever arrived.
const MODEL_TIMEOUT_MS = 45_000;
// No new video frame for this long, with the tab visible, means the camera went away.
const STALL_MS = 4_000;

export type StartPhase = "requesting" | "loading";

export class LiveSession {
  private stream: MediaStream | null = null;
  private raf = 0;
  private lastTime = -1;
  private lastAdvance = 0;
  private yawns = new YawnTracker();
  // Bumped by every start and stop, so a cancelled start knows to back out.
  private attempt = 0;

  constructor(
    private video: HTMLVideoElement,
    private onFrame: (f: LiveFrame) => void,
    private onFail: (err: LiveError) => void,
  ) {
    document.addEventListener("visibilitychange", () => {
      this.lastAdvance = performance.now(); // time in the background isn't a stall
    });
  }

  /** Resolves true once frames are flowing, false if stop() was called meanwhile. Throws on failure. */
  async start(onPhase: (phase: StartPhase) => void): Promise<boolean> {
    const attempt = ++this.attempt;
    if (window.isSecureContext && !navigator.mediaDevices?.getUserMedia) throw new LiveError("unsupported");

    onPhase("requesting");
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    });
    if (attempt !== this.attempt) {
      stream.getTracks().forEach((t) => t.stop()); // allowed after Cancel: switch it straight off
      return false;
    }
    this.stream = stream;
    stream.getVideoTracks()[0]?.addEventListener("ended", () => this.fail(new LiveError("disconnected")));
    this.video.srcObject = stream;
    try {
      await this.video.play();
    } catch (err) {
      throw new LiveError("playback", err);
    }
    if (attempt !== this.attempt) return false;

    onPhase("loading");
    let landmarkers: { face: FaceLandmarker; pose: PoseLandmarker };
    try {
      landmarkers = await withTimeout(loadLandmarkers(), MODEL_TIMEOUT_MS);
    } catch (err) {
      throw new LiveError(err instanceof TimeoutError ? "timeout" : "models", err);
    }
    if (attempt !== this.attempt) return false;

    const { face, pose } = landmarkers;
    this.yawns = new YawnTracker();
    this.lastAdvance = performance.now();

    const tick = () => {
      this.raf = requestAnimationFrame(tick);
      const v = this.video;
      const now = performance.now();
      if (v.readyState < 2 || v.currentTime === this.lastTime) {
        if (!document.hidden && now - this.lastAdvance > STALL_MS) this.fail(new LiveError("disconnected"));
        return;
      }
      this.lastTime = v.currentTime;
      this.lastAdvance = now;

      try {
        const faceLm = face.detectForVideo(v, now).faceLandmarks[0];
        const poseLm = pose.detectForVideo(v, now).landmarks[0];
        const w = v.videoWidth;
        const h = v.videoHeight;
        const posePts = poseLm ? (pick(poseLm, POSE_INDEX, true) as PosePoints) : null;
        const facePts = faceLm ? (pick(faceLm, FACE_INDEX, false) as FacePoints) : null;
        const frame = evaluate(posePts, facePts, w, h);
        const recentYawns = this.yawns.update(now / 1000, frame.issues.includes("Yawning"));
        this.onFrame({ pose: posePts, face: facePts, w, h, result: addHistory(frame, recentYawns), recentYawns });
      } catch (err) {
        this.fail(new LiveError("detection", err));
      }
    };
    tick();
    return true;
  }

  private fail(err: LiveError) {
    if (!this.stream) return; // already stopped
    this.stop();
    this.onFail(err);
  }

  stop() {
    this.attempt++;
    cancelAnimationFrame(this.raf);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.srcObject = null;
    this.lastTime = -1;
  }

  get running() {
    return this.stream !== null;
  }
}
