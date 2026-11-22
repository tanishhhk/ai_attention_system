// What can go wrong with the live check, and what to tell the visitor.
// Kept free of MediaPipe so it can be unit-tested.

export type LiveErrorKind = "unsupported" | "playback" | "models" | "timeout" | "disconnected" | "detection";

export class LiveError extends Error {
  constructor(
    public kind: LiveErrorKind,
    public cause?: unknown,
  ) {
    super(kind);
    this.name = "LiveError";
  }
}

export class TimeoutError extends Error {
  constructor() {
    super("timeout");
    this.name = "TimeoutError";
  }
}

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError()), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

const LIVE_MESSAGES: Record<LiveErrorKind, { title: string; detail: string }> = {
  unsupported: {
    title: "This browser can't use the camera",
    detail: "Try a recent version of Chrome, Edge, Firefox or Safari. The examples below work in any browser.",
  },
  playback: {
    title: "The camera didn't start",
    detail: "The camera turned on but the video wouldn't play. Reload the page and try again.",
  },
  models: {
    title: "The camera didn't start",
    detail: "The face and pose models didn't load. Check your connection and try again.",
  },
  timeout: {
    title: "Loading is taking too long",
    detail: "The face and pose models haven't finished downloading. Check your connection and try again.",
  },
  disconnected: {
    title: "Camera disconnected",
    detail: "The camera stopped sending video. It may have been unplugged, switched off or taken by another app.",
  },
  detection: {
    title: "Detection stopped",
    detail: "Something went wrong while reading the video. Try again, and reload the page if it keeps happening.",
  },
};

// Errors the browser raises when asking for the camera.
const CAMERA_MESSAGES: Record<string, string> = {
  NotAllowedError: "Camera access is blocked. Allow it in your browser's site settings, or use the examples below.",
  SecurityError: "Camera access is blocked. Allow it in your browser's site settings, or use the examples below.",
  NotFoundError: "No camera was found on this device. The examples below work without one.",
  OverconstrainedError: "No camera was found on this device. The examples below work without one.",
  NotReadableError: "Another app is using the camera. Close it and try again.",
  AbortError: "The camera request was interrupted. Try again.",
};

export function describeError(err: unknown, secureContext = true): { title: string; detail: string } {
  if (err instanceof LiveError) return LIVE_MESSAGES[err.kind];
  const name = err instanceof Error || err instanceof DOMException ? err.name : "";
  if (CAMERA_MESSAGES[name]) return { title: "The camera didn't start", detail: CAMERA_MESSAGES[name] };
  if (!secureContext) return { title: "The camera didn't start", detail: "The camera only works over https." };
  return { title: "The camera didn't start", detail: "Something unexpected went wrong. Reload the page and try again." };
}
