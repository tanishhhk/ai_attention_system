// Webcam + MediaPipe landmarkers, all in the browser. Frames are never uploaded.
import { FaceLandmarker, FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import type { FacePoints, PosePoints, Result } from "./rules";
import { evaluate } from "./rules";

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

export type LiveFrame = { pose: PosePoints | null; face: FacePoints | null; w: number; h: number; result: Result };

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

export function cameraErrorMessage(err: unknown): string {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError") return "Camera access is blocked. Allow it in your browser's site settings, or use the examples below.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No camera was found on this device. The examples below work without one.";
  if (name === "NotReadableError") return "Another app is using the camera. Close it and press Start camera again.";
  if (!window.isSecureContext) return "The camera only works over https.";
  return "The face and pose models didn't load. Check your connection and press Start camera again.";
}

export class LiveSession {
  private stream: MediaStream | null = null;
  private raf = 0;
  private lastTime = -1;

  constructor(
    private video: HTMLVideoElement,
    private onFrame: (f: LiveFrame) => void,
  ) {}

  async start(onStatus: (msg: string) => void) {
    onStatus("Asking for camera access…");
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    });
    this.video.srcObject = this.stream;
    await this.video.play();

    onStatus("Loading the face and pose models…");
    const { face, pose } = await loadLandmarkers();
    if (!this.stream) return; // stopped while loading
    onStatus("");

    const tick = () => {
      this.raf = requestAnimationFrame(tick);
      const v = this.video;
      if (v.readyState < 2 || v.currentTime === this.lastTime) return;
      this.lastTime = v.currentTime;

      const now = performance.now();
      const faceLm = face.detectForVideo(v, now).faceLandmarks[0];
      const poseLm = pose.detectForVideo(v, now).landmarks[0];
      const w = v.videoWidth;
      const h = v.videoHeight;
      const posePts = poseLm ? (pick(poseLm, POSE_INDEX, true) as PosePoints) : null;
      const facePts = faceLm ? (pick(faceLm, FACE_INDEX, false) as FacePoints) : null;
      this.onFrame({ pose: posePts, face: facePts, w, h, result: evaluate(posePts, facePts, w, h) });
    };
    tick();
  }

  stop() {
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
