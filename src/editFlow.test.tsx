// @vitest-environment jsdom
// The save and edit-session flows through the whole App: edit, autosave, Revert to original and a change
// on disk while editing. A fake disk stands behind the mocked IPC; typing changes the editor's DOM text,
// which ProseMirror reads back as a user edit.
import { emit } from "@tauri-apps/api/event";
import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { EditorView } from "@codemirror/view";
import App from "./App";

// Limitation: no edit made in the editor was found whose Markdown reopens differently, so the "not exact"
// test makes the real editor session report its snapshot as inexact instead.
const inexact = vi.hoisted(() => ({ on: false }));
vi.mock("./editor/session", async (original) => {
  const real = await original<typeof import("./editor/session")>();
  return {
    ...real,
    createEditor: async (...args: Parameters<typeof real.createEditor>) => {
      const session = await real.createEditor(...args);
      const snapshot = session.snapshot;
      session.snapshot = (base) => ({ ...snapshot(base), exact: !inexact.on });
      return session;
    },
  };
});

// A downloaded update: `installed` holds what the file said each time the update installed.
const update = vi.hoisted(() => ({ installed: [] as (string | undefined)[], disk: (): string | undefined => undefined }));
vi.mock("@tauri-apps/plugin-updater", () => ({
  check: async () => ({
    version: "9.9.9",
    download: async () => {},
    install: async () => void update.installed.push(update.disk()),
    close: async () => {},
  }),
}));

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
/** The save_doc paths the disk accepted, in order. */
let savedPaths: string[];
/** When set, save_doc refuses with this message. */
let refuse: string | undefined;
/** The button picked in the Save / Don't save / Cancel dialog, and the dialogs shown. */
type Choice = "Save" | "Don't save" | "Cancel";
let choice: Choice;
/** Picked before `choice`, one per dialog, when several dialogs come in a row. */
let choices: Choice[];
let questions: string[];
/** The path the Save As dialog returns. */
let savePath: string | null;
/** How many times the window was destroyed (closed). */
let destroyed: number;

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
  savedPaths = [];
  refuse = undefined;
  choice = "Save";
  choices = [];
  questions = [];
  savePath = null;
  destroyed = 0;
  inexact.on = false;
  update.installed = [];
  update.disk = () => disk.get(FILE);
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
          if (refuse) throw refuse;
          // The file must still hold the text the edits were made to.
          if (a.expected != null && disk.get(a.path) !== a.expected) throw "The file changed on disk.";
          if (disk.get(a.path) === a.text) return false;
          disk.set(a.path, a.text);
          writes.push(a.text);
          savedPaths.push(a.path);
          return true;
        }
        case "plugin:dialog|message": {
          // ask() resolves to whether the answer is the button it named as the confirming one.
          if (a.buttons.YesNoCancelCustom) {
            questions.push(a.message);
            return choices.shift() ?? choice;
          }
          askings.push(a.message);
          const [ok, cancel] = a.buttons.OkCancelCustom;
          return answer ? ok : cancel;
        }
        case "plugin:dialog|save":
          return savePath;
        case "plugin:window|destroy":
          destroyed++;
          return null;
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
async function type(text: string, over = "Original") {
  const p = [...host.querySelectorAll(".ProseMirror p")].find((el) => el.textContent?.includes(over))!;
  await act(async () => {
    p.firstChild!.nodeValue = text;
  });
  // ProseMirror reads the mutation after a short delay, then the app marks the file unsaved.
  await until(() => saveStateButton()?.dataset.state === "unsaved", "the edit to register");
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

// Paths where unsaved work could be lost: closing, failed saves, Save As, Source mode and the "not exact" refusal.

const closeTabButton = () => host.querySelector<HTMLButtonElement>('button[aria-label^="Close note.md"]');
const tabCount = () => host.querySelectorAll("[data-tab-id]").length;
const saveStateButton = () => host.querySelector<HTMLButtonElement>("button.save-state");
const errorBanner = () => host.querySelector(".error")?.textContent;
/** The window is asked to close, as when its close button is pressed. */
const closeWindow = () => act(async () => void (await emit("tauri://close-requested")));

test("closing a tab with autosave on saves the edits first without asking", async () => {
  await launch();
  await startEditing();
  await type("Changed text.");
  await click(closeTabButton());
  await until(() => tabCount() === 0, "the tab to close");
  expect(questions).toEqual([]);
  expect(disk.get(FILE)).toBe(EDITED);
});

test("closing a tab with autosave off: Save writes the edits and closes", async () => {
  await launch(NO_AUTOSAVE);
  await startEditing();
  await type("Changed text.");
  await click(closeTabButton());
  await until(() => tabCount() === 0, "the tab to close");
  expect(questions).toHaveLength(1);
  expect(disk.get(FILE)).toBe(EDITED);
});

test("closing a tab with autosave off: Don't save closes and leaves the file alone", async () => {
  await launch(NO_AUTOSAVE);
  await startEditing();
  await type("Changed text.");
  choice = "Don't save";
  await click(closeTabButton());
  await until(() => tabCount() === 0, "the tab to close");
  expect(attempts).toEqual([]);
  expect(disk.get(FILE)).toBe(ORIGINAL);
});

test("closing a tab with autosave off: Cancel keeps the tab and the edits", async () => {
  await launch(NO_AUTOSAVE);
  await startEditing();
  await type("Changed text.");
  choice = "Cancel";
  await click(closeTabButton());
  await until(() => questions.length === 1, "the question");
  await settle(100);
  expect(tabCount()).toBe(1);
  expect(attempts).toEqual([]);
  expect(editorText()).toContain("Changed text.");
});

test("a save that fails while closing a tab keeps the tab and the edits", async () => {
  await launch(NO_AUTOSAVE);
  await startEditing();
  await type("Changed text.");
  refuse = "No space left on device";
  answer = false;
  await click(closeTabButton());
  await until(() => askings.length === 1, "the question");
  await settle(100);
  expect(askings[0]).toContain("No space left on device");
  expect(tabCount()).toBe(1);
  expect(editorText()).toContain("Changed text.");
  // The retry works once the disk accepts the write.
  refuse = undefined;
  await click(saveStateButton());
  await until(() => disk.get(FILE) === EDITED, "the retry to write");
});

test("a save that fails while closing a tab can still close it when the user agrees", async () => {
  await launch(NO_AUTOSAVE);
  await startEditing();
  await type("Changed text.");
  refuse = "No space left on device";
  answer = true;
  await click(closeTabButton());
  await until(() => tabCount() === 0, "the tab to close");
  expect(disk.get(FILE)).toBe(ORIGINAL);
});

test("closing the window with autosave on saves the edits and closes", async () => {
  await launch();
  await startEditing();
  await type("Changed text.");
  await closeWindow();
  await until(() => destroyed === 1, "the window to close");
  expect(questions).toEqual([]);
  expect(disk.get(FILE)).toBe(EDITED);
});

test("closing the window with autosave off: Save writes and closes", async () => {
  await launch(NO_AUTOSAVE);
  await startEditing();
  await type("Changed text.");
  await closeWindow();
  await until(() => destroyed === 1, "the window to close");
  expect(questions).toHaveLength(1);
  expect(disk.get(FILE)).toBe(EDITED);
});

test("closing the window with autosave off: Don't save closes without writing", async () => {
  await launch(NO_AUTOSAVE);
  await startEditing();
  await type("Changed text.");
  choice = "Don't save";
  await closeWindow();
  await until(() => destroyed === 1, "the window to close");
  expect(attempts).toEqual([]);
  expect(disk.get(FILE)).toBe(ORIGINAL);
});

test("closing the window with autosave off: Cancel keeps it open with the edits", async () => {
  await launch(NO_AUTOSAVE);
  await startEditing();
  await type("Changed text.");
  choice = "Cancel";
  await closeWindow();
  await until(() => questions.length === 1, "the question");
  await settle(100);
  expect(destroyed).toBe(0);
  expect(attempts).toEqual([]);
  expect(editorText()).toContain("Changed text.");
});

test("closing the window without edits closes at once", async () => {
  await launch();
  await closeWindow();
  await until(() => destroyed === 1, "the window to close");
  expect(questions).toEqual([]);
});

test("a save that fails while closing the window keeps it open unless the user agrees", async () => {
  await launch(NO_AUTOSAVE);
  await startEditing();
  await type("Changed text.");
  refuse = "Access is denied";
  answer = false;
  await closeWindow();
  await until(() => askings.length === 1, "the question");
  await settle(100);
  expect(askings[0]).toContain("Access is denied");
  expect(destroyed).toBe(0);
  expect(editorText()).toContain("Changed text.");
  answer = true;
  await closeWindow();
  await until(() => destroyed === 1, "the window to close");
  expect(disk.get(FILE)).toBe(ORIGINAL);
});

test.each(["No space left on device", "Access is denied", "No such file"])("a failed autosave (%s) keeps the edits, shows the error and a retry works", async (reason) => {
  await launch();
  await startEditing();
  refuse = reason;
  await type("Changed text.");
  await until(() => attempts.length === 1, "the autosave attempt");
  await until(() => errorBanner(), "the error");
  expect(errorBanner()).toContain(reason);
  expect(saveStateButton()?.dataset.state).toBe("error");
  expect(editorText()).toContain("Changed text.");
  expect(disk.get(FILE)).toBe(ORIGINAL);
  refuse = undefined;
  await click(saveStateButton());
  await until(() => disk.get(FILE) === EDITED, "the retry to write");
  await until(() => !errorBanner(), "the error to clear");
});

test("a file that cannot be read when opening shows an error and the app keeps running", async () => {
  disk.clear();
  localStorage.setItem("prefs", JSON.stringify({}));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<App />));
  await until(() => errorBanner(), "the error");
  expect(errorBanner()).toContain("No such file");
  expect(host.querySelector(".doc-column")).toBeNull();
  // Another file still opens.
  disk.set("C:\\docs\\other.md", "# Other\n");
  await act(async () => void (await emit("open-file", "C:\\docs\\other.md")));
  await until(() => host.querySelector(".doc-column")?.textContent?.includes("Other"), "the other file");
});

const COPY = "C:\\docs\\copy.md";
const saveAsButton = () => host.querySelector<HTMLButtonElement>('button[aria-label^="Save as"]');

test("Save As writes the edits to the new path, leaves the original and the tab follows", async () => {
  await launch(NO_AUTOSAVE);
  await startEditing();
  await type("Changed text.");
  savePath = COPY;
  await click(saveAsButton());
  await until(() => disk.has(COPY), "the copy to be written");
  expect(disk.get(COPY)).toBe(EDITED);
  expect(disk.get(FILE)).toBe(ORIGINAL);
  await until(() => host.querySelector('button[aria-label^="Close copy.md"]'), "the tab to show the copy");
  expect(closeTabButton()).toBeNull();
  // Nothing is written to the original afterwards.
  await settle(1300);
  expect(savedPaths).toEqual([COPY]);
  expect(disk.get(FILE)).toBe(ORIGINAL);
});

test("cancelling the Save As dialog writes nothing", async () => {
  await launch(NO_AUTOSAVE);
  await startEditing();
  await type("Changed text.");
  savePath = null;
  await click(saveAsButton());
  await settle(100);
  expect(attempts).toEqual([]);
  expect(editorText()).toContain("Changed text.");
});

const sourceView = () => host.querySelector<HTMLElement>(".cm-content");
async function openSource() {
  await click([...host.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.trim() === "Source")!);
  await until(sourceView, "Source mode");
}
/** Replaces the whole text of Source mode, as typing would. */
async function typeSource(text: string) {
  const view = EditorView.findFromDOM(host.querySelector<HTMLElement>(".cm-editor")!)!;
  await act(async () => void view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } }));
}

test("Source mode edits are autosaved", async () => {
  await launch();
  await startEditing();
  await openSource();
  await typeSource(EDITED);
  await until(() => writes.length === 1, "the autosave");
  expect(disk.get(FILE)).toBe(EDITED);
});

test("Source mode edits are written on Done when autosave is off", async () => {
  await launch(NO_AUTOSAVE);
  await startEditing();
  await openSource();
  await typeSource(EDITED);
  await settle(1300);
  expect(writes).toEqual([]);
  await click(host.querySelector(".done-btn"));
  await until(() => writes.length === 1, "the save on Done");
  expect(disk.get(FILE)).toBe(EDITED);
});

test("an edit the editor can't write back as the same Markdown is refused: nothing is written and the user is told", async () => {
  await launch(NO_AUTOSAVE);
  await startEditing();
  await type("Changed text.");
  inexact.on = true;
  await click(host.querySelector(".done-btn"));
  await until(() => saveStateButton()?.dataset.state === "error", "the refusal");
  expect(attempts).toEqual([]);
  expect(disk.get(FILE)).toBe(ORIGINAL);
  expect(saveStateButton()?.title).toContain("Nothing was written");
  // The edits are kept as a draft, so the tab still counts as unsaved.
  expect(host.querySelector(".unsaved-dot")).not.toBeNull();
});

test("autosave also refuses an inexact edit", async () => {
  await launch();
  await startEditing();
  inexact.on = true;
  await type("Changed text.");
  await settle(1300);
  expect(attempts).toEqual([]);
  expect(errorBanner()).toContain("Nothing was written");
  expect(editorText()).toContain("Changed text.");
});

test("a refused edit offers no retry while editing", async () => {
  await launch();
  await startEditing();
  inexact.on = true;
  await type("Changed text.");
  await until(() => saveStateButton()?.dataset.state === "error", "the refusal");
  expect(saveStateButton()?.title).toContain("undo or change the last edit");
  expect(saveStateButton()?.title).not.toContain("try again");
});

test("after Done a refused edit points to Edit, and changing the edit there saves it", async () => {
  await launch(NO_AUTOSAVE);
  await startEditing();
  await type("Changed text.");
  inexact.on = true;
  await click(host.querySelector(".done-btn"));
  await until(() => saveStateButton()?.dataset.state === "error", "the refusal");
  expect(saveStateButton()?.title).toContain("press Edit");
  expect(saveStateButton()?.title).not.toContain("try again");
  expect(errorBanner()).toContain("press Edit");
  // Saving again without changing anything is still refused.
  await click(saveStateButton());
  await settle(50);
  expect(attempts).toEqual([]);
  inexact.on = false;
  await startEditing();
  await type("Changed again.", "Changed text.");
  await click(host.querySelector(".done-btn"));
  await until(() => writes.length === 1, "the save on Done");
  expect(disk.get(FILE)).toBe("# Title\n\nChanged again.\n");
});

// Closing several tabs, and closing for an update.

const OTHER = "C:\\docs\\other.md";
const THIRD = "C:\\docs\\third.md";
const EDITED_OTHER = "# Other\n\nChanged text.\n";
const openTabs = () => [...host.querySelectorAll<HTMLElement>("[data-tab-id]")].map((t) => t.title);
const tabOf = (file: string) => [...host.querySelectorAll<HTMLElement>("[data-tab-id]")].find((t) => t.title === file)!;
const showTab = (file: string) => click(tabOf(file).querySelector("button"));
/** Opens `file` in its own tab and shows it. */
async function openFile(file: string, text = "# Other\n\nOriginal text.\n") {
  disk.set(file, text);
  await act(async () => void (await emit("open-file", file)));
  await until(() => tabOf(file) && host.querySelector(".doc-column")?.textContent?.includes("Other"), `${file} to open`);
}
/** Opens `file` and edits it; leaving its tab later keeps the edits as a draft. */
async function editOther(file: string) {
  await openFile(file);
  await startEditing();
  await type("Changed text.");
}
/** Picks `label` in the menu of the tab showing `file`. */
async function fromTabMenu(file: string, label: string) {
  await act(async () => void tabOf(file).dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })));
  await until(() => host.querySelector(".menu"), "the tab menu");
  await click([...host.querySelectorAll(".menu-item")].find((b) => b.firstChild?.textContent === label)!);
}

test("Close others with autosave off: Save writes the edits of the open editor and keeps the chosen tab", async () => {
  await launch(NO_AUTOSAVE);
  await openFile(OTHER);
  await showTab(FILE);
  await startEditing();
  await type("Changed text.");
  await fromTabMenu(OTHER, "Close others");
  await until(() => openTabs().length === 1, "the other tabs to close");
  expect(openTabs()).toEqual([OTHER]);
  expect(questions).toHaveLength(1);
  expect(disk.get(FILE)).toBe(EDITED);
  expect(disk.get(OTHER)).not.toContain("Changed");
});

test("Close others with autosave on saves without asking", async () => {
  await launch();
  await openFile(OTHER);
  await showTab(FILE);
  await startEditing();
  await type("Changed text.");
  await fromTabMenu(OTHER, "Close others");
  await until(() => openTabs().length === 1, "the other tabs to close");
  expect(questions).toEqual([]);
  expect(disk.get(FILE)).toBe(EDITED);
});

test("Close others: Don't save closes the edited tab and leaves its file alone", async () => {
  await launch(NO_AUTOSAVE);
  await openFile(OTHER);
  await showTab(FILE);
  await startEditing();
  await type("Changed text.");
  choice = "Don't save";
  await fromTabMenu(OTHER, "Close others");
  await until(() => openTabs().length === 1, "the other tabs to close");
  expect(attempts).toEqual([]);
  expect(disk.get(FILE)).toBe(ORIGINAL);
});

test("Close tabs to the right closes only those, saving each edited tab after asking about it", async () => {
  await launch(NO_AUTOSAVE);
  await editOther(OTHER);
  await editOther(THIRD);
  await fromTabMenu(FILE, "Close tabs to the right");
  await until(() => openTabs().length === 1, "the tabs to the right to close");
  expect(openTabs()).toEqual([FILE]);
  expect(questions).toHaveLength(2);
  expect(savedPaths).toEqual([OTHER, THIRD]);
  expect(disk.get(OTHER)).toBe(EDITED_OTHER);
  expect(disk.get(THIRD)).toBe(EDITED_OTHER);
  expect(disk.get(FILE)).toBe(ORIGINAL);
});

test("closing several edited tabs: Cancel on one keeps it and the tabs after it", async () => {
  const fourth = "C:\\docs\\fourth.md";
  await launch(NO_AUTOSAVE);
  await editOther(OTHER);
  await editOther(THIRD);
  await editOther(fourth);
  choices = ["Save", "Cancel"];
  await fromTabMenu(FILE, "Close tabs to the right");
  await until(() => questions.length === 2, "the second question");
  await until(() => openTabs().length === 3, "the first tab to close");
  await settle(100);
  expect(questions).toHaveLength(2);
  expect(openTabs()).toEqual([FILE, THIRD, fourth]);
  expect(savedPaths).toEqual([OTHER]);
  expect(disk.get(THIRD)).not.toContain("Changed");
  expect(disk.get(fourth)).not.toContain("Changed");
  expect(tabOf(THIRD).querySelector(".unsaved-dot")).not.toBeNull();
});

test("closing several edited tabs: Don't save and Save are each kept to their own tab", async () => {
  await launch(NO_AUTOSAVE);
  await editOther(OTHER);
  await editOther(THIRD);
  choices = ["Don't save", "Save"];
  await fromTabMenu(FILE, "Close tabs to the right");
  await until(() => openTabs().length === 1, "the tabs to close");
  expect(savedPaths).toEqual([THIRD]);
  expect(disk.get(OTHER)).not.toContain("Changed");
});

test("closing several edited tabs: a save that fails and is kept open stops the rest", async () => {
  await launch(NO_AUTOSAVE);
  await editOther(OTHER);
  await editOther(THIRD);
  refuse = "Access is denied";
  answer = false;
  await fromTabMenu(FILE, "Close tabs to the right");
  await until(() => askings.length === 1, "the question");
  await settle(100);
  expect(askings[0]).toContain("Access is denied");
  expect(questions).toHaveLength(1);
  expect(openTabs()).toEqual([FILE, OTHER, THIRD]);
});

test("Close others writes a draft left behind by a failed autosave, without asking", async () => {
  await launch();
  await openFile(OTHER);
  await startEditing();
  refuse = "Access is denied";
  await type("Changed text.");
  await showTab(FILE);
  await until(() => attempts.length >= 1, "the failed save");
  refuse = undefined;
  await fromTabMenu(FILE, "Close others");
  await until(() => openTabs().length === 1, "the other tab to close");
  expect(questions).toEqual([]);
  expect(disk.get(OTHER)).toBe(EDITED_OTHER);
});

/** A checked and downloaded update, offered in the toolbar. */
async function readyUpdate() {
  await click(button("Settings"));
  await click([...host.querySelectorAll(".settings-nav button")].find((b) => b.textContent === "About")!);
  await click([...host.querySelectorAll(".settings button")].find((b) => b.textContent === "Check now")!);
  await until(() => host.querySelector(".update-btn"), "the update to be ready");
  await click(button("Close settings"));
}
const restartNow = async () => {
  await click(host.querySelector(".update-btn"));
  await click([...host.querySelectorAll("button")].find((b) => b.textContent === "Restart now")!);
};

test("Restart now with autosave on saves the edits before the update installs", async () => {
  await launch();
  await startEditing();
  await type("Changed text.");
  await readyUpdate();
  await restartNow();
  await until(() => update.installed.length === 1, "the update to install");
  expect(questions).toEqual([]);
  expect(update.installed).toEqual([EDITED]);
});

test("Restart now with autosave off: Save writes the edits before the update installs", async () => {
  await launch(NO_AUTOSAVE);
  await startEditing();
  await type("Changed text.");
  await readyUpdate();
  await restartNow();
  await until(() => update.installed.length === 1, "the update to install");
  expect(questions).toHaveLength(1);
  expect(update.installed).toEqual([EDITED]);
});

test("Restart now with autosave off: Don't save installs and leaves the file alone", async () => {
  await launch(NO_AUTOSAVE);
  await startEditing();
  await type("Changed text.");
  await readyUpdate();
  choice = "Don't save";
  await restartNow();
  await until(() => update.installed.length === 1, "the update to install");
  expect(attempts).toEqual([]);
  expect(update.installed).toEqual([ORIGINAL]);
});

test("Restart now with autosave off: Cancel doesn't install and keeps the edits", async () => {
  await launch(NO_AUTOSAVE);
  await startEditing();
  await type("Changed text.");
  await readyUpdate();
  choice = "Cancel";
  await restartNow();
  await until(() => questions.length === 1, "the question");
  await settle(100);
  expect(update.installed).toEqual([]);
  expect(attempts).toEqual([]);
  expect(editorText()).toContain("Changed text.");
});

test("Restart now with a failed save doesn't install unless the user agrees", async () => {
  await launch(NO_AUTOSAVE);
  await startEditing();
  await type("Changed text.");
  await readyUpdate();
  refuse = "Access is denied";
  answer = false;
  await restartNow();
  await until(() => askings.length === 1, "the question");
  await settle(100);
  expect(askings[0]).toContain("Access is denied");
  expect(update.installed).toEqual([]);
  expect(editorText()).toContain("Changed text.");
  answer = true;
  await click([...host.querySelectorAll("button")].find((b) => b.textContent === "Restart now")!);
  await until(() => update.installed.length === 1, "the update to install");
  expect(update.installed).toEqual([ORIGINAL]);
});

test("Restart now without edits installs at once", async () => {
  await launch();
  await readyUpdate();
  await restartNow();
  await until(() => update.installed.length === 1, "the update to install");
  expect(questions).toEqual([]);
  expect(attempts).toEqual([]);
});
