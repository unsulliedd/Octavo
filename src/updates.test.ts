import { expect, test } from "vitest";
import { busy, nextStatus, releaseUrl, statusLine, type UpdateEvent, type UpdateStatus } from "./updates";

const run = (events: UpdateEvent[], from: UpdateStatus = { state: "idle" }) => events.reduce(nextStatus, from);

test("an update found on launch downloads and is then ready", () => {
  expect(run([{ type: "check", manual: false }, { type: "found", version: "0.5.1" }])).toEqual({ state: "downloading", version: "0.5.1", manual: false });
  expect(run([{ type: "check", manual: false }, { type: "found", version: "0.5.1" }, { type: "downloaded" }])).toEqual({ state: "ready", version: "0.5.1" });
});

test("a check on launch that finds nothing or fails says nothing", () => {
  expect(run([{ type: "check", manual: false }, { type: "none" }])).toEqual({ state: "idle" });
  expect(run([{ type: "check", manual: false }, { type: "failed", message: "offline" }])).toEqual({ state: "idle" });
  expect(run([{ type: "check", manual: false }, { type: "found", version: "0.5.1" }, { type: "failed", message: "offline" }])).toEqual({ state: "idle" });
});

test("a check from Settings reports that Octavo is up to date, or what failed", () => {
  expect(run([{ type: "check", manual: true }, { type: "none" }])).toEqual({ state: "current" });
  expect(run([{ type: "check", manual: true }, { type: "failed", message: "offline" }])).toEqual({ state: "failed", during: "check", message: "offline" });
  expect(run([{ type: "check", manual: true }, { type: "found", version: "0.5.1" }, { type: "failed", message: "bad signature" }])).toEqual({
    state: "failed",
    during: "download",
    message: "bad signature",
  });
});

test("a check can start again after it reported its outcome, but not while one is under way", () => {
  expect(run([{ type: "check", manual: true }], { state: "current" })).toEqual({ state: "checking", manual: true });
  expect(run([{ type: "check", manual: true }], { state: "failed", during: "check", message: "offline" })).toEqual({ state: "checking", manual: true });
  const downloading: UpdateStatus = { state: "downloading", version: "0.5.1", manual: false };
  expect(run([{ type: "check", manual: true }], downloading)).toBe(downloading);
  const ready: UpdateStatus = { state: "ready", version: "0.5.1" };
  expect(run([{ type: "check", manual: true }], ready)).toBe(ready);
});

test("only a downloaded update installs; a failed install is reported", () => {
  expect(run([{ type: "install" }])).toEqual({ state: "idle" });
  expect(run([{ type: "install" }], { state: "ready", version: "0.5.1" })).toEqual({ state: "installing", version: "0.5.1" });
  expect(run([{ type: "install" }, { type: "failed", message: "denied" }], { state: "ready", version: "0.5.1" })).toEqual({
    state: "failed",
    during: "install",
    message: "denied",
  });
});

test("busy while checking, downloading or installing", () => {
  expect(busy({ state: "checking", manual: false })).toBe(true);
  expect(busy({ state: "downloading", version: "0.5.1", manual: false })).toBe(true);
  expect(busy({ state: "installing", version: "0.5.1" })).toBe(true);
  expect(busy({ state: "ready", version: "0.5.1" })).toBe(false);
  expect(busy({ state: "idle" })).toBe(false);
});

test("status lines for Settings", () => {
  expect(statusLine({ state: "idle" })).toBe("");
  expect(statusLine({ state: "current" })).toBe("Octavo is up to date.");
  expect(statusLine({ state: "ready", version: "0.5.1" })).toBe("Octavo 0.5.1 is ready. Restart to install it.");
  // A failed check or download says what to try instead of the updater's own message.
  expect(statusLine({ state: "failed", during: "check", message: "Could not fetch a valid release JSON from the remote" })).toBe(
    "Couldn't check for updates. Check your internet connection and try again.",
  );
  expect(statusLine({ state: "failed", during: "download", message: "timed out" })).toBe(
    "Couldn't download the update. Check your internet connection and try again.",
  );
  expect(statusLine({ state: "failed", during: "install", message: "denied" })).toBe("Couldn't install the update: denied");
});

test("the release page of a version, with or without a leading v", () => {
  expect(releaseUrl("0.5.1")).toBe("https://github.com/unsulliedd/Octavo/releases/tag/v0.5.1");
  expect(releaseUrl("v0.5.1")).toBe("https://github.com/unsulliedd/Octavo/releases/tag/v0.5.1");
});
