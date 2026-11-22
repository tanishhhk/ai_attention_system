import { describe, expect, it, vi } from "vitest";
import { LiveError, TimeoutError, describeError, withTimeout } from "./errors";

const domError = (name: string) => Object.assign(new Error(name), { name });

describe("describeError", () => {
  it.each([
    ["NotAllowedError", "blocked"],
    ["SecurityError", "blocked"],
    ["NotFoundError", "No camera was found"],
    ["OverconstrainedError", "No camera was found"],
    ["NotReadableError", "Another app"],
    ["AbortError", "interrupted"],
  ])("explains %s", (name, words) => {
    expect(describeError(domError(name)).detail).toContain(words);
  });

  it.each([
    ["unsupported", "This browser can't use the camera"],
    ["disconnected", "Camera disconnected"],
    ["detection", "Detection stopped"],
    ["timeout", "Loading is taking too long"],
  ] as const)("gives %s its own title", (kind, title) => {
    expect(describeError(new LiveError(kind)).title).toBe(title);
  });

  it("separates models failing from video not playing", () => {
    expect(describeError(new LiveError("models")).detail).toContain("models didn't load");
    expect(describeError(new LiveError("playback")).detail).toContain("wouldn't play");
  });

  it("mentions https only for unknown errors outside a secure page", () => {
    expect(describeError(new Error("x"), false).detail).toContain("https");
    expect(describeError(new Error("x"), true).detail).not.toContain("https");
  });
});

describe("withTimeout", () => {
  it("passes a result through", async () => {
    await expect(withTimeout(Promise.resolve(7), 50)).resolves.toBe(7);
  });

  it("rejects with TimeoutError when the promise hangs", async () => {
    vi.useFakeTimers();
    const pending = withTimeout(new Promise(() => {}), 1000);
    vi.advanceTimersByTime(1000);
    await expect(pending).rejects.toBeInstanceOf(TimeoutError);
    vi.useRealTimers();
  });

  it("passes a failure through", async () => {
    await expect(withTimeout(Promise.reject(new Error("net")), 50)).rejects.toThrow("net");
  });
});
