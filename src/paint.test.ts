import { afterEach, expect, test, vi } from "vitest";
import { afterPaint } from "./paint";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("afterPaint resolves after the next frame has been painted", async () => {
  vi.useFakeTimers();
  let frame: FrameRequestCallback | undefined;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => ((frame = cb), 1));
  let resolved = false;
  afterPaint(1000).then(() => (resolved = true));
  await vi.advanceTimersByTimeAsync(10);
  expect(resolved).toBe(false); // no frame yet
  frame!(0);
  await vi.advanceTimersByTimeAsync(0);
  expect(resolved).toBe(true);
});

test("afterPaint falls back to a timer when no frame comes", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("requestAnimationFrame", () => 1);
  let resolved = false;
  afterPaint(100).then(() => (resolved = true));
  await vi.advanceTimersByTimeAsync(99);
  expect(resolved).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  expect(resolved).toBe(true);
});
