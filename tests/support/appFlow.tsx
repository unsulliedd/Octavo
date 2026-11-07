// For flow tests: the whole App on a fake disk behind the mocked IPC, as the other flows set it up, with every
// IPC call recorded. Dialogs are answered with their first button unless a test answers them itself.
import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { vi } from "vitest";
import App from "@/app/App";
import { answerDialogs, type DialogAnswer } from "./dialogTesting";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

export const FILE = "C:\\docs\\note.md";
export const OTHER = "C:\\docs\\other.md";

export type Flow = {
  host: HTMLElement;
  disk: Map<string, string>;
  /** Every IPC call, in order. */
  calls: { cmd: string; args: Record<string, any> }[];
  /** The app's version. */
  version: string;
  /** What initial_file answers, and what it waits for first. */
  initialFile: string | null;
  initialGate?: Promise<void>;
  /** What the open and save dialogs answer. */
  picked: string | null;
  savePath: string | null;
  /** Answers a dialog; the first button when unset. */
  answer?: (text: string, labels: string[]) => DialogAnswer;
  /** The system's dark-mode listeners, and whether it is dark. */
  systemDark: { matches: boolean; listeners: (() => void)[] };
};

let root: Root | undefined;
let stopAnswering = () => {};

/** Sets up the mocks before each test; the returned object is the same one for the whole test. */
export function setUpFlow(files: Record<string, string>): Flow {
  localStorage.clear();
  const flow: Flow = {
    host: document.createElement("div"),
    disk: new Map(Object.entries(files)),
    calls: [],
    version: "0.0.0",
    initialFile: FILE,
    picked: null,
    savePath: null,
    systemDark: { matches: false, listeners: [] },
  };
  stopAnswering = answerDialogs((text, labels) => flow.answer?.(text, labels) ?? labels[0]);
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() {
      return query.includes("dark") && flow.systemDark.matches;
    },
    media: query,
    addEventListener: (_: string, fn: () => void) => flow.systemDark.listeners.push(fn),
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  }));
  window.requestAnimationFrame = (cb) => window.setTimeout(() => cb(performance.now()), 0);
  // jsdom has no layout: ProseMirror measures positions with these.
  const noRects = () => Object.assign([], { item: () => null });
  Element.prototype.getClientRects = noRects as never;
  Range.prototype.getClientRects = noRects as never;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
  Element.prototype.scrollTo = () => {};
  Element.prototype.scrollBy = () => {};
  Element.prototype.scrollIntoView = () => {};
  // No Worker in jsdom: rendering falls back to the main thread, and says so.
  vi.spyOn(console, "warn").mockImplementation(() => {});
  mockWindows("main");
  mockIPC(
    async (cmd, args) => {
      const a = (args ?? {}) as Record<string, any>;
      flow.calls.push({ cmd, args: a });
      switch (cmd) {
        case "plugin:app|version":
          return flow.version;
        case "initial_file":
          await flow.initialGate;
          return flow.initialFile;
        case "open_doc": {
          const text = flow.disk.get(a.path);
          if (text === undefined) throw "No such file";
          return { path: a.path, text };
        }
        case "save_doc":
          if (a.expected != null && flow.disk.get(a.path) !== a.expected) throw "The file changed on disk.";
          flow.disk.set(a.path, a.text);
          return true;
        case "write_notes": {
          const path = `C:\\notes\\${a.version}.md`;
          flow.disk.set(path, a.text);
          return path;
        }
        case "place_images":
          return a.paths;
        case "plugin:dialog|open":
          return flow.picked;
        case "plugin:dialog|save":
          return flow.savePath;
        default:
          return null;
      }
    },
    { shouldMockEvents: true },
  );
  (window as any).__TAURI_INTERNALS__.convertFileSrc = (path: string) => `asset://${path}`;
  return flow;
}

export async function tearDownFlow() {
  stopAnswering();
  await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = "";
  clearMocks();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
}

export const settle = (ms = 0) => act(() => new Promise<void>((done) => setTimeout(done, ms)));

/** Waits (in real time) until `check` holds. */
export async function until(check: () => unknown, what: string) {
  for (let i = 0; i < 300; i++) {
    if (check()) return;
    await settle(20);
  }
  throw new Error(`Timed out waiting for ${what}`);
}

/** Starts the app; with `waitFor`, until that element shows. */
export async function launch(flow: Flow, prefs: object = {}, waitFor: string | undefined = ".doc-column") {
  localStorage.setItem("prefs", JSON.stringify(prefs));
  document.body.append(flow.host);
  root = createRoot(flow.host);
  await act(async () => root!.render(<App />));
  if (waitFor) await until(() => flow.host.querySelector(waitFor), waitFor);
}

export const click = (el: Element | null | undefined) => act(async () => void (el as HTMLElement).click());

/** A key press in the window, from `target`; resolves to whether it went unhandled. */
export async function press(key: string, mods: { ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean } = {}, target: Element = document.body) {
  let unhandled = true;
  await act(async () => {
    unhandled = target.dispatchEvent(new KeyboardEvent("keydown", { key, ...mods, bubbles: true, cancelable: true }));
  });
  return unhandled;
}

export const tabNames = (flow: Flow) => [...flow.host.querySelectorAll(".tab .tab-open span:last-child")].map((s) => s.textContent);
export const calls = (flow: Flow, cmd: string) => flow.calls.filter((c) => c.cmd === cmd);
