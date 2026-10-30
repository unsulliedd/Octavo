// @vitest-environment jsdom
// The save and edit-session flows through the whole App: edit, autosave, Revert to original and a change
// on disk while editing. A fake disk stands behind the mocked IPC; typing changes the editor's DOM text,
// which ProseMirror reads back as a user edit.
import { emit } from "@tauri-apps/api/event";
import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import App from "./App";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const FILE = "C:\\docs\\note.md";
const ORIGINAL = "# Title\n\nOriginal text.\n";

let host: HTMLElement;
let root: Root;
let disk: Map<string, string>;
let writes: string[];
/** Every save_doc call, including the ones the disk refuses. */
let attempts: string[];
let answer: boolean;
let askings: string[];

const settle = (ms = 0) => act(() => new Promise<void>((done) => setTimeout(done, ms)));
/** Waits (in real time) until `check` holds. */
async function until(check: () => unknown, what: string) {
  for (let i = 0; i < 300; i++) {
    if (check()) return;
    await settle(20);
  }
  throw new Error(`Timed out waiting for ${what}`);
}

beforeEach(async () => {
  localStorage.clear();
  disk = new Map([[FILE, ORIGINAL]]);
  writes = [];
  attempts = [];
  askings = [];
  answer = true;
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
  window.requestAnimationFrame = (cb) => window.setTimeout(() => cb(performance.now()), 0);
  // jsdom has no layout: ProseMirror measures positions with these.
  const noRects = () => Object.assign([], { item: () => null });
  Element.prototype.getClientRects = noRects as never;
  Range.prototype.getClientRects = noRects as never;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
  Element.prototype.scrollTo = () => {};
  Element.prototype.scrollIntoView = () => {};
  // No Worker in jsdom: rendering falls back to the main thread, and says so.
  vi.spyOn(console, "warn").mockImplementation(() => {});
  mockWindows("main");
  mockIPC(
    (cmd, args) => {
      const a = (args ?? {}) as Record<string, any>;
      switch (cmd) {
        case "plugin:app|version":
          return "0.0.0";
        case "initial_file":
          return FILE;
        case "open_doc": {
          const text = disk.get(a.path);
          if (text === undefined) throw "No such file";
          return { path: a.path, text };
        }
        case "save_doc": {
          attempts.push(a.text);
          // The file must still hold the text the edits were made to.
          if (a.expected != null && disk.get(a.path) !== a.expected) throw "The file changed on disk.";
          if (disk.get(a.path) === a.text) return false;
          disk.set(a.path, a.text);
          writes.push(a.text);
          return true;
        }
        case "plugin:dialog|message": {
          // ask() resolves to whether the answer is the button it named as the confirming one.
          askings.push(a.message);
          const [ok, cancel] = a.buttons.OkCancelCustom;
          return answer ? ok : cancel;
        }
        default:
          return null;
      }
    },
    { shouldMockEvents: true },
  );
  (window as any).__TAURI_INTERNALS__.convertFileSrc = (path: string) => `asset://${path}`;
});

/** Starts the app with the file open in the reading view. */
async function launch(prefs: object = {}) {
  localStorage.setItem("prefs", JSON.stringify(prefs));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<App />));
  await until(() => host.querySelector(".doc-column"), "the document to open");
}

afterEach(async () => {
  await act(async () => root?.unmount());
  document.body.innerHTML = "";
  clearMocks();
  vi.unstubAllGlobals();
});

const button = (name: string) => host.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)!;
const click = (el: Element | null) => act(async () => void (el as HTMLElement).click());

async function startEditing() {
  await click(host.querySelector(".edit-btn"));
  await until(() => host.querySelector(".ProseMirror"), "the editor");
  await until(() => host.querySelector(".ProseMirror p"), "the editor's text");
}

/** Types into the editor: the paragraph's text node changes and ProseMirror reads the mutation. */
async function type(text: string) {
  const p = [...host.querySelectorAll(".ProseMirror p")].find((el) => el.textContent?.includes("Original"))!;
  await act(async () => {
    p.firstChild!.nodeValue = text;
  });
}

const EDITED = "# Title\n\nChanged text.\n";
const ELSEWHERE = "# Title\n\nElsewhere.\n";
const NO_AUTOSAVE = { autosave: false };
const editorText = () => host.querySelector(".ProseMirror")?.textContent ?? "";
const banner = () => host.querySelector(".conflict")?.textContent;
const choose = (label: string) => click([...host.querySelectorAll(".conflict button")].find((b) => b.textContent === label)!);
const revert = async () => {
  await until(() => button("Revert to original")?.disabled === false, "Revert to original to be enabled");
  await click(button("Revert to original"));
  await settle(50);
};
/** The file changes on disk and the watcher reports it. */
async function changeOnDisk(text: string) {
  disk.set(FILE, text);
  await act(async () => void (await emit("doc-changed", FILE)));
  await settle(400);
}

test("typing in the editor is autosaved to the file after a pause", async () => {
  await launch();
  await startEditing();
  await type("Changed text.");
  expect(disk.get(FILE)).toBe(ORIGINAL);
  await until(() => writes.length === 1, "the autosave");
  expect(disk.get(FILE)).toBe(EDITED);
});

test("without autosave nothing is written until Done", async () => {
  await launch(NO_AUTOSAVE);
  await startEditing();
  await type("Changed text.");
  await settle(1300);
  expect(writes).toEqual([]);
  await click(host.querySelector(".done-btn"));
  await until(() => writes.length === 1, "the save on Done");
  expect(disk.get(FILE)).toBe(EDITED);
  expect(host.querySelector(".ProseMirror")).toBeNull();
});

test("Revert to original writes the original back after the edits were autosaved", async () => {
  await launch();
  await startEditing();
  await type("Changed text.");
  await until(() => writes.length === 1, "the autosave");
  await revert();
  expect(askings).toHaveLength(1);
  expect(disk.get(FILE)).toBe(ORIGINAL);
  expect(host.querySelector(".ProseMirror")).toBeNull();
  expect(host.querySelector(".doc-column")?.textContent).toContain("Original text.");
  // No later autosave writes the edits again.
  await settle(1300);
  expect(disk.get(FILE)).toBe(ORIGINAL);
});

test("Revert to original drops unsaved edits without touching the file", async () => {
  await launch(NO_AUTOSAVE);
  await startEditing();
  await type("Changed text.");
  await revert();
  expect(writes).toEqual([]);
  expect(host.querySelector(".ProseMirror")).toBeNull();
  expect(host.querySelector(".doc-column")?.textContent).toContain("Original text.");
});

test("declining Revert keeps the edits and the file as saved", async () => {
  await launch();
  await startEditing();
  await type("Changed text.");
  await until(() => writes.length === 1, "the autosave");
  answer = false;
  await revert();
  expect(askings).toHaveLength(1);
  expect(disk.get(FILE)).toBe(EDITED);
  expect(editorText()).toContain("Changed text.");
});

test("Revert to original is refused when the file changed on disk under unsaved edits", async () => {
  await launch(NO_AUTOSAVE);
  await startEditing();
  await type("Changed text.");
  await changeOnDisk(ELSEWHERE);
  expect(banner()).toContain("changed on disk");
  await revert();
  expect(disk.get(FILE)).toBe(ELSEWHERE);
  expect(attempts).toEqual([]);
  expect(editorText()).toContain("Changed text.");
});

test("a change on disk reloads an editor without edits", async () => {
  await launch();
  await startEditing();
  await changeOnDisk(ELSEWHERE);
  await until(() => editorText().includes("Elsewhere."), "the editor to load the new text");
  expect(banner()).toBeUndefined();
  expect(writes).toEqual([]);
});

test("a change on disk under unsaved edits keeps them, writes nothing and offers a choice", async () => {
  await launch();
  await startEditing();
  await type("Changed text.");
  await changeOnDisk(ELSEWHERE);
  expect(banner()).toContain("changed on disk");
  // The pending autosave is cancelled.
  await settle(1300);
  expect(attempts).toEqual([]);
  expect(disk.get(FILE)).toBe(ELSEWHERE);
  expect(editorText()).toContain("Changed text.");
});

test("Keep my version writes the edits over the changed file", async () => {
  await launch(NO_AUTOSAVE);
  await startEditing();
  await type("Changed text.");
  await changeOnDisk(ELSEWHERE);
  await choose("Keep my version");
  await until(() => writes.length === 1, "the write");
  expect(disk.get(FILE)).toBe(EDITED);
  expect(banner()).toBeUndefined();
});

test("Reload from disk drops the edits and shows the changed file", async () => {
  await launch(NO_AUTOSAVE);
  await startEditing();
  await type("Changed text.");
  await changeOnDisk(ELSEWHERE);
  await choose("Reload from disk");
  await until(() => editorText().includes("Elsewhere."), "the editor to load the disk text");
  expect(writes).toEqual([]);
  expect(banner()).toBeUndefined();
});
