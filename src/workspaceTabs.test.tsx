// @vitest-environment jsdom
// Tabs per workspace through the whole App, with the real editor: a fake disk, saved workspaces and dialogs
// stand behind the mocked IPC.
import { emit } from "@tauri-apps/api/event";
import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { EditorView } from "@codemirror/view";
import App from "./App";
import { answerDialogs } from "./dialogTesting";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ROOT = "C:\\docs\\Handbook";
const NOTES = "C:\\docs\\Notes";
const GUIDE = `${ROOT}\\guide.md`;
const SPEC = `${ROOT}\\spec.md`;
const IDEAS = `${NOTES}\\ideas.md`;
const SHARED = "C:\\docs\\shared.md";
const text = (name: string, body = "Original text.") => `# ${name}\n\n${body}\n`;
const saved = (id: string, path: string) => ({ id, name: path.split("\\").pop()!, items: [{ kind: "folder", path }], removed: [] });

type Choice = "Save" | "Don't save" | "Cancel";
type Held = { path: string; finish: () => void };

let host: HTMLElement;
let root: Root;
let disk: Map<string, string>;
let scans: Map<string, string[]>;
let stored: unknown[];
let writes: string[];
/** The paths the fake watcher was last told about. */
let watched: string[];
/** When set, save_doc refuses with this message. */
let refuse: string | undefined;
/** What the folder picker answers. */
let picked: string | null;
let choice: Choice;
/** The Save / Don't save / Cancel questions shown, and what answers the next one when set. */
let questions: string[];
let holdDialog: Promise<void> | undefined;
/** The "couldn't be saved" questions shown, and whether they are confirmed. */
let warnings: string[];
let agree: boolean;
let stopAnswering: () => void;
let held: Held[] | undefined;
let initialFile: string | null;
/** Every document read, the refusal of the saved list, and what its load waits for. */
let reads: string[];
let loadRefusal: string | undefined;
let loadGate: Promise<void> | undefined;

const settle = (ms = 0) => act(() => new Promise<void>((done) => setTimeout(done, ms)));
async function until(check: () => unknown, what: string) {
  for (let i = 0; i < 300; i++) {
    if (check()) return;
    await settle(20);
  }
  throw new Error(`Timed out waiting for ${what}`);
}

beforeEach(() => {
  localStorage.clear();
  disk = new Map([GUIDE, SPEC, IDEAS, SHARED].map((p) => [p, text(p.split("\\").pop()!)]));
  scans = new Map([
    [ROOT, [GUIDE, SPEC, SHARED]],
    [NOTES, [IDEAS, SHARED]],
  ]);
  stored = [saved("h", ROOT), saved("n", NOTES)];
  writes = [];
  watched = [];
  refuse = undefined;
  picked = null;
  choice = "Save";
  questions = [];
  holdDialog = undefined;
  warnings = [];
  agree = false;
  stopAnswering = answerDialogs(async (text, labels) => {
    if (labels.length === 1) return labels[0];
    if (labels.includes("Don't save")) {
      questions.push(text);
      await holdDialog;
      return choice;
    }
    warnings.push(text);
    return agree ? labels[0] : labels[1];
  });
  held = undefined;
  initialFile = null;
  reads = [];
  loadRefusal = undefined;
  loadGate = undefined;
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
  window.requestAnimationFrame = (cb) => window.setTimeout(() => cb(performance.now()), 0);
  const noRects = () => Object.assign([], { item: () => null });
  Element.prototype.getClientRects = noRects as never;
  Range.prototype.getClientRects = noRects as never;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
  Element.prototype.scrollTo = function (this: Element, _x: unknown, y: unknown) {
    this.scrollTop = y as number;
  } as never;
  // As in the webview, it returns a promise.
  Element.prototype.scrollIntoView = (() => Promise.resolve()) as never;
  vi.spyOn(console, "warn").mockImplementation(() => {});
  mockWindows("main");
  mockIPC(
    async (cmd, args) => {
      const a = (args ?? {}) as Record<string, any>;
      switch (cmd) {
        case "plugin:app|version":
          return "0.0.0";
        case "initial_file":
          return initialFile;
        case "open_doc": {
          reads.push(a.path);
          const content = disk.get(a.path);
          if (content === undefined) throw "No such file";
          return { path: a.path, text: content };
        }
        case "save_doc":
          if (refuse) throw refuse;
          if (a.expected != null && disk.get(a.path) !== a.expected) throw "The file changed on disk.";
          disk.set(a.path, a.text);
          writes.push(a.text);
          return true;
        case "plugin:dialog|open":
          return picked;
        case "watch_docs":
          watched = a.paths;
          return null;
        case "load_workspaces":
          await loadGate;
          if (loadRefusal) throw loadRefusal;
          return { workspaces: stored, problem: null };
        case "save_workspaces":
          stored = a.workspaces;
          return null;
        case "scan_folder":
          await new Promise<void>((finish) => (held ? held.push({ path: a.path, finish }) : finish()));
          return { files: scans.get(a.path) ?? [], truncated: false };
        default:
          return null;
      }
    },
    { shouldMockEvents: true },
  );
  (window as any).__TAURI_INTERNALS__.convertFileSrc = (path: string) => `asset://${path}`;
});

afterEach(async () => {
  stopAnswering();
  await act(async () => root?.unmount());
  document.body.innerHTML = "";
  clearMocks();
  vi.unstubAllGlobals();
});

async function launch(prefs: object = {}) {
  localStorage.setItem("prefs", JSON.stringify({ ...JSON.parse(localStorage.getItem("prefs") ?? "{}"), ...prefs }));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<App />));
  await settle();
  await until(() => !host.querySelector(".loading"), "the app to start");
}

async function restart() {
  await act(async () => root.unmount());
  host.remove();
  await launch();
}

const all = <T extends Element = HTMLElement>(selector: string) => [...host.querySelectorAll<T>(selector)];
const byText = (selector: string, label: string) => all(selector).find((el) => el.textContent?.trim() === label);
/** The button that opens the card of workspace `name` on Home. */
const homeCard = (name: string) => all(".card").find((c) => c.querySelector(".card-name")?.textContent === name)?.querySelector<HTMLElement>(".card-open");
const click = (el: Element | null | undefined) => {
  if (!el) throw new Error("Nothing to click");
  return act(async () => void (el as HTMLElement).click());
};
const openTabs = () => all(".tab").map((t) => t.textContent);
const shownTab = () => host.querySelector('.tab[aria-current="page"]')?.textContent;
const article = () => host.querySelector("article")?.textContent ?? "";
const open = () => host.querySelector(".status-workspace")?.textContent;
const status = () => host.querySelector(".save-state")?.textContent;
const key = (k: string, mods: KeyboardEventInit) =>
  act(async () => void window.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...mods })));

/** Opens workspace `name` from Home, or from the workspace menu once one is open. */
async function pickWorkspace(name: string) {
  const row = homeCard(name);
  if (row) return click(row);
  await click(host.querySelector(".status-workspace"));
  await click(byText(".menu [role=menuitemradio]", name));
}

async function enter(name: string) {
  await pickWorkspace(name);
  await until(() => open() === name, `workspace ${name}`);
  await until(() => all(".tree-row").length, "the tree");
}

async function closeWorkspace() {
  await click(host.querySelector(".status-workspace"));
  await click(byText(".menu button", "Close workspace"));
}

/** Opens a document from the tree and waits for it. */
async function openDoc(name: string) {
  await click(byText(".tree-row", name));
  await until(() => host.querySelector("article h1")?.textContent?.includes(name), name);
}

async function startEditing() {
  await click(host.querySelector(".edit-btn"));
  await until(() => host.querySelector(".ProseMirror p"), "the editor");
}

async function type(typed: string) {
  const p = all(".ProseMirror p").find((el) => el.textContent?.includes("Original"))!;
  await act(async () => void (p.firstChild!.nodeValue = typed));
  await until(() => host.querySelector<HTMLElement>("button.save-state")?.dataset.state === "unsaved", "the edit to register");
}

async function typeSource(typed: string) {
  await click(byText("button", "Source"));
  await until(() => host.querySelector(".cm-content"), "Source mode");
  const view = EditorView.findFromDOM(host.querySelector<HTMLElement>(".cm-editor")!)!;
  await act(async () => void view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: typed } }));
  await until(() => host.querySelector<HTMLElement>("button.save-state")?.dataset.state === "unsaved", "the edit to register");
}

/** Handbook with guide.md open and edited, not yet saved. */
async function editGuide(prefs: object = {}) {
  await launch(prefs);
  await enter("Handbook");
  await openDoc("guide.md");
  await startEditing();
  await type("Changed text.");
}

const AUTOSAVE_OFF = { autosave: false };
const EDITED = text("guide.md", "Changed text.");

test("each workspace keeps its tabs, their order, the shown tab and its history", async () => {
  disk.set(GUIDE, `# guide.md

[spec](spec.md)
`);
  await launch();
  await enter("Handbook");
  await openDoc("guide.md");
  await click(host.querySelector("article a"));
  await until(() => host.querySelector("article h1")?.textContent?.includes("spec.md"), "the linked document");
  await openDoc("shared.md");
  expect(openTabs()).toEqual(["guide.md", "spec.md", "shared.md"]);
  await click(all(".tab")[1].querySelector(".tab-open"));
  await until(() => host.querySelector("article h1")?.textContent?.includes("spec.md"), "the tab");
  await click(host.querySelector('[aria-label^="Back"]'));
  await until(() => all(".tab")[1].textContent === "guide.md", "going back");

  await enter("Notes");
  expect(openTabs()).toEqual([]);
  expect(host.querySelector(".home")).not.toBeNull();
  await openDoc("ideas.md");

  await enter("Handbook");
  await until(() => openTabs().length === 3, "the tabs back");
  expect(openTabs()).toEqual(["guide.md", "guide.md", "shared.md"]);
  expect(all(".tab").findIndex((t) => t.getAttribute("aria-current"))).toBe(1);
  await until(() => host.querySelector('[aria-label^="Forward"]:not(:disabled)'), "the forward history");

  await closeWorkspace();
  await until(() => open() === undefined, "the workspace to close");
  expect(openTabs()).toEqual([]);
  await enter("Notes");
  await until(() => shownTab() === "ideas.md", "the other workspace's tab");
  expect(openTabs()).toEqual(["ideas.md"]);
});

test("the tabs of no workspace come back unchanged when a workspace closes", async () => {
  initialFile = SHARED;
  await launch();
  await until(() => host.querySelector("article h1"), "the document");
  initialFile = null;
  await click(byText(".seg button", "Files"));
  await until(() => byText("button", "Choose folder…"), "the offer");
  await click(host.querySelector('[aria-label="Home"]'));
  await click(homeCard("Handbook"));
  await until(() => open() === "Handbook", "the workspace");
  expect(openTabs()).toEqual([]);
  await closeWorkspace();
  await until(() => openTabs().length, "the tabs back");
  expect(openTabs()).toEqual(["shared.md"]);
});

test("with autosave on, edits are saved before the switch, without a question", async () => {
  await editGuide();
  await enter("Notes");
  expect(disk.get(GUIDE)).toBe(EDITED);
  expect(questions).toEqual([]);
  expect(host.querySelector(".ProseMirror")).toBeNull();
  await enter("Handbook");
  await until(() => article().includes("Changed text."), "the saved text");
  expect(host.querySelector(".ProseMirror")).toBeNull();
  expect(status()).toBe("Reading");
});

test("autosave on: no timer writes after the switch, and one save is all that happens", async () => {
  await editGuide();
  await enter("Notes");
  await settle(1300);
  expect(writes).toEqual([EDITED]);
});

test("autosave off: Save writes the edits and the switch happens", async () => {
  await editGuide(AUTOSAVE_OFF);
  await settle(1100);
  expect(writes).toEqual([]);
  await enter("Notes");
  expect(questions).toEqual(["Save your changes to guide.md before switching?"]);
  expect(disk.get(GUIDE)).toBe(EDITED);
  expect(host.querySelector(".ProseMirror")).toBeNull();
});

test("autosave off: Don't save drops the edits, leaves the file alone and the switch happens", async () => {
  choice = "Don't save";
  await editGuide(AUTOSAVE_OFF);
  await enter("Notes");
  expect(writes).toEqual([]);
  await enter("Handbook");
  await until(() => article().includes("Original text."), "the file's text");
  expect(host.querySelector(".unsaved-dot")).toBeNull();
  expect(status()).toBe("Reading");
});

test("autosave off: Cancel keeps everything where it was", async () => {
  choice = "Cancel";
  await editGuide(AUTOSAVE_OFF);
  const order = JSON.stringify(stored);
  await pickWorkspace("Notes");
  await until(() => questions.length, "the question");
  await settle();
  expect(open()).toBe("Handbook");
  expect(writes).toEqual([]);
  expect(host.querySelector(".ProseMirror")?.textContent).toContain("Changed text.");
  expect(openTabs()).toEqual(["guide.md"]);
  expect(JSON.stringify(stored)).toBe(order);
  expect(JSON.parse(localStorage.getItem("workspace")!)).toBe("h");
  // The session goes on: a save still writes the edits.
  choice = "Save";
  await click(host.querySelector(".done-btn"));
  await until(() => writes.length, "the save");
  expect(disk.get(GUIDE)).toBe(EDITED);
});

test("Cancel also stops closing the workspace", async () => {
  choice = "Cancel";
  await editGuide(AUTOSAVE_OFF);
  await closeWorkspace();
  await until(() => questions.length, "the question");
  await settle();
  expect(open()).toBe("Handbook");
  expect(JSON.parse(localStorage.getItem("workspace")!)).toBe("h");
  expect(host.querySelector(".ProseMirror")).not.toBeNull();
});

test("closing the workspace saves edits like a switch", async () => {
  await editGuide();
  await closeWorkspace();
  await until(() => open() === undefined, "the workspace to close");
  expect(disk.get(GUIDE)).toBe(EDITED);
});

test("Source mode edits go through the same path, and the view closes clean", async () => {
  await launch(AUTOSAVE_OFF);
  await enter("Handbook");
  await openDoc("guide.md");
  await startEditing();
  await typeSource(EDITED);
  await enter("Notes");
  expect(questions).toHaveLength(1);
  expect(disk.get(GUIDE)).toBe(EDITED);
  expect(host.querySelector(".cm-content")).toBeNull();
  await settle(1100);
  expect(writes).toEqual([EDITED]);
});

test("a draft left by a tab that isn't shown is saved too", async () => {
  await launch(AUTOSAVE_OFF);
  await enter("Handbook");
  await openDoc("spec.md");
  await openDoc("guide.md");
  await startEditing();
  await type("Changed text.");
  await click(byText(".tab", "spec.md")?.querySelector(".tab-open"));
  await until(() => host.querySelector("article h1")?.textContent?.includes("spec.md"), "the other tab");
  await enter("Notes");
  expect(questions).toEqual(["Save your changes to guide.md before switching?"]);
  expect(disk.get(GUIDE)).toBe(EDITED);
});

const LINKED = `# guide.md

Original text. [spec](spec.md)
`;

/**
 * guide.md (`original` on disk) is edited in the only tab showing it, whose Forward shows spec.md; Forward is
 * pressed, so no tab shows guide.md and its edits are a draft.
 */
async function leaveDraftBehind(prefs: object, original = LINKED) {
  disk.set(GUIDE, original);
  await launch(prefs);
  await enter("Handbook");
  await openDoc("guide.md");
  await click(host.querySelector("article a"));
  await until(() => host.querySelector("article h1")?.textContent?.includes("spec.md"), "the linked document");
  await click(host.querySelector('[aria-label^="Back"]'));
  await until(() => all(".tab")[1].textContent === "guide.md", "going back");
  await click(all(".tab")[0].querySelector('[aria-label^="Close"]'));
  await until(() => openTabs().length === 1, "the first tab to close");
  await startEditing();
  await type("Changed text.");
  await click(host.querySelector('[aria-label^="Forward"]'));
  await until(() => host.querySelector("article h1")?.textContent?.includes("spec.md"), "the next document");
}

test("a draft no tab shows is written to its file, with the file's own line endings, BOM and final break", async () => {
  const original = "﻿" + LINKED.replace(/\n/g, "\r\n").trimEnd();
  await leaveDraftBehind({}, original);
  await until(() => disk.get(GUIDE) !== original, "the draft to be written");
  expect(openTabs()).toEqual(["spec.md"]);
  expect(disk.get(GUIDE)).toBe(original.replace("Original text. ", "Changed text."));
  expect(writes).toHaveLength(1);
});

test("autosave off: the switch saves a draft no tab shows", async () => {
  await leaveDraftBehind(AUTOSAVE_OFF);
  await enter("Notes");
  expect(questions).toEqual(["Save your changes to guide.md before switching?"]);
  expect(warnings).toEqual([]);
  expect(disk.get(GUIDE)).toBe(LINKED.replace("Original text. ", "Changed text."));
});

test("a draft no tab shows isn't written over a file that changed on disk, and the switch stops", async () => {
  await leaveDraftBehind(AUTOSAVE_OFF);
  const outside = "# guide.md\n\nChanged elsewhere.\n";
  disk.set(GUIDE, outside);
  await pickWorkspace("Notes");
  await until(() => warnings.length, "the warning");
  await settle();
  expect(warnings[0]).toContain("guide.md: The file changed on disk.");
  expect(disk.get(GUIDE)).toBe(outside);
  expect(writes).toEqual([]);
  expect(open()).toBe("Handbook");
});

test("edits that can't be written, in a document no tab shows now, stop the switch instead of being dropped", async () => {
  await leaveDraftBehind(AUTOSAVE_OFF);
  refuse = "The disk is full.";
  await pickWorkspace("Notes");
  await until(() => warnings.length, "the warning");
  await settle();
  expect(warnings[0]).toContain("guide.md: The disk is full.");
  expect(open()).toBe("Handbook");
});

test("Don't save also drops a draft left by a tab that isn't shown", async () => {
  choice = "Don't save";
  await launch(AUTOSAVE_OFF);
  await enter("Handbook");
  await openDoc("spec.md");
  await openDoc("guide.md");
  await startEditing();
  await type("Changed text.");
  await click(byText(".tab", "spec.md")?.querySelector(".tab-open"));
  await until(() => host.querySelector("article h1")?.textContent?.includes("spec.md"), "the other tab");
  await enter("Notes");
  expect(writes).toEqual([]);
  await enter("Handbook");
  await click(byText(".tab", "guide.md")?.querySelector(".tab-open"));
  await until(() => article().includes("Original text."), "the file's text");
  expect(article()).not.toContain("Changed text.");
  expect(host.querySelector(".unsaved-dot")).toBeNull();
});

test("a tab in Source mode doesn't put the tab with the same place in the next workspace in Source mode", async () => {
  await launch();
  await enter("Notes");
  await openDoc("ideas.md");
  await enter("Handbook");
  await openDoc("guide.md");
  await startEditing();
  await typeSource(EDITED);
  await enter("Notes");
  await until(() => article().includes("ideas.md"), "the document");
  expect(host.querySelector(".cm-content")).toBeNull();
  expect(host.querySelector(".edit-btn")).not.toBeNull();
});

test("a failed save stops the switch when the user keeps the document open", async () => {
  refuse = "Access is denied.";
  await editGuide();
  await pickWorkspace("Notes");
  await until(() => warnings.length, "the warning");
  await settle();
  expect(warnings[0]).toContain("guide.md: Access is denied.");
  expect(warnings[0]).toContain("Switch anyway and lose the unsaved edits?");
  expect(open()).toBe("Handbook");
  expect(host.querySelector(".ProseMirror")?.textContent).toContain("Changed text.");
  refuse = undefined;
  await enter("Notes");
  expect(disk.get(GUIDE)).toBe(EDITED);
});

test("a failed save stops nothing once the user agrees, and the edits are dropped", async () => {
  refuse = "Access is denied.";
  agree = true;
  await editGuide();
  await enter("Notes");
  expect(writes).toEqual([]);
  refuse = undefined;
  await settle(1300);
  expect(writes).toEqual([]);
  await enter("Handbook");
  await until(() => article().includes("Original text."), "the file's text");
  expect(status()).toBe("Reading");
});

test("a conflict with the file on disk counts as a failed save", async () => {
  await launch(AUTOSAVE_OFF);
  await enter("Handbook");
  await openDoc("guide.md");
  await startEditing();
  await type("Changed text.");
  disk.set(GUIDE, text("guide.md", "Elsewhere."));
  await act(async () => void (await emit("doc-changed", GUIDE)));
  await until(() => host.querySelector(".conflict"), "the conflict");
  await pickWorkspace("Notes");
  await until(() => warnings.length, "the warning");
  await settle();
  expect(open()).toBe("Handbook");
  expect(disk.get(GUIDE)).toBe(text("guide.md", "Elsewhere."));
  expect(host.querySelector(".conflict")).not.toBeNull();
});

test("a second switch while the question is open is ignored", async () => {
  let answer = () => {};
  holdDialog = new Promise((done) => (answer = done));
  await editGuide(AUTOSAVE_OFF);
  await pickWorkspace("Notes");
  await until(() => questions.length, "the question");
  await closeWorkspace();
  await settle();
  expect(questions).toHaveLength(1);
  await act(async () => answer());
  await until(() => open() === "Notes", "the switch");
  expect(disk.get(GUIDE)).toBe(EDITED);
});

test("a switch while a scan runs swaps the tabs, and the scan shows only in its own workspace", async () => {
  await launch();
  await enter("Handbook");
  await openDoc("guide.md");
  held = [];
  await click(host.querySelector('[aria-label="Refresh"]'));
  await until(() => held!.length, "the scan");
  await enter2("Notes");
  expect(openTabs()).toEqual([]);
  while (held!.length) await act(async () => held!.pop()!.finish());
  await until(() => byText(".tree-row", "ideas.md"), "the tree");
  expect(byText(".tree-row", "guide.md")).toBeUndefined();
  held = undefined;
  await enter("Handbook");
  await until(() => shownTab() === "guide.md", "the tab back");
  await until(() => article().includes("guide.md"), "the document back");
});

/** Opens workspace `name` while scans are held, so its tree isn't there yet. */
async function enter2(name: string) {
  await pickWorkspace(name);
  await until(() => open() === name, `workspace ${name}`);
}

test("a restart restores the open workspace with its tabs, shown tab, history and scroll position", async () => {
  await launch();
  await enter("Handbook");
  await openDoc("spec.md");
  await openDoc("guide.md");
  await click(byText(".tab", "spec.md")?.querySelector(".tab-open"));
  await until(() => host.querySelector("article h1")?.textContent?.includes("spec.md"), "the tab");
  host.querySelector(".reader")!.scrollTop = 140;
  await enter("Notes");
  await openDoc("ideas.md");
  await restart();
  await until(() => shownTab() === "ideas.md", "the workspace's tab");
  expect(open()).toBe("Notes");
  expect(openTabs()).toEqual(["ideas.md"]);
  await until(() => article().includes("ideas.md"), "the document");
  expect(JSON.parse(localStorage.getItem("tabs:h")!).tabs[0].entries[0].scroll).toBe(140);
  await enter("Handbook");
  await until(() => shownTab() === "spec.md", "the tab shown when it was left");
  expect(openTabs()).toEqual(["spec.md", "guide.md"]);
});

test("a stored tab whose file is gone shows the read error, as with no workspace", async () => {
  await launch();
  await enter("Handbook");
  await openDoc("guide.md");
  await restart();
  disk.delete(GUIDE);
  await restart();
  await until(() => host.querySelector(".error.banner")?.textContent?.includes("No such file"), "the error");
  expect(openTabs()).toEqual(["guide.md"]);
});

test("a stored tabs value from before workspaces still opens, and workspaces leave it alone", async () => {
  const before = JSON.stringify({ tabs: [{ entries: [{ path: SHARED, scroll: 30 }], index: 0 }], active: 0 });
  localStorage.setItem("tabs", before);
  await launch();
  await until(() => article().includes("shared.md"), "the document");
  expect(openTabs()).toEqual(["shared.md"]);
  await click(host.querySelector('[aria-label="Home"]'));
  await enter("Handbook");
  await openDoc("guide.md");
  expect(JSON.parse(localStorage.getItem("tabs")!).tabs[0].entries[0]).toEqual({ path: SHARED, scroll: 30 });
  await closeWorkspace();
  await until(() => openTabs()[0] === "shared.md", "the tabs back");
  await restart();
  await until(() => article().includes("shared.md"), "the document after a restart");
  expect(open()).toBeUndefined();
});

test("a workspace that no longer exists brings back the tabs of no workspace, and a file from the command line joins them", async () => {
  localStorage.setItem("workspace", JSON.stringify("gone"));
  localStorage.setItem("tabs:gone", JSON.stringify({ tabs: [{ entries: [{ path: GUIDE, scroll: 0 }], index: 0 }], active: 0 }));
  localStorage.setItem("tabs", JSON.stringify({ tabs: [{ entries: [{ path: SHARED, scroll: 0 }], index: 0 }], active: 0 }));
  initialFile = IDEAS;
  let finish = () => {};
  loadGate = new Promise((done) => (finish = done));
  await launch();
  await settle(50);
  await act(async () => finish());
  await until(() => openTabs().length === 2, "both tabs");
  expect(openTabs()).toEqual(["shared.md", "ideas.md"]);
});

test("a saved list that can't be read brings back the tabs of no workspace", async () => {
  localStorage.setItem("workspace", JSON.stringify("h"));
  localStorage.setItem("tabs:h", JSON.stringify({ tabs: [{ entries: [{ path: GUIDE, scroll: 0 }], index: 0 }], active: 0 }));
  localStorage.setItem("tabs", JSON.stringify({ tabs: [{ entries: [{ path: SHARED, scroll: 0 }], index: 0 }], active: 0 }));
  loadRefusal = "Access is denied.";
  await launch();
  await until(() => openTabs()[0] === "shared.md", "the tabs of no workspace");
  expect(open()).toBeUndefined();
});

test("a restart reads the open workspace's document, not the tabs of no workspace", async () => {
  localStorage.setItem("workspace", JSON.stringify("h"));
  localStorage.setItem("tabs:h", JSON.stringify({ tabs: [{ entries: [{ path: GUIDE, scroll: 0 }], index: 0 }], active: 0 }));
  localStorage.setItem("tabs", JSON.stringify({ tabs: [{ entries: [{ path: SHARED, scroll: 0 }], index: 0 }], active: 0 }));
  await launch();
  await until(() => article().includes("guide.md"), "the document");
  expect(reads).toEqual([GUIDE]);
});

test("a file from the command line opens in the workspace that comes back", async () => {
  localStorage.setItem("workspace", JSON.stringify("h"));
  localStorage.setItem("tabs:h", JSON.stringify({ tabs: [{ entries: [{ path: GUIDE, scroll: 0 }], index: 0 }], active: 0 }));
  initialFile = IDEAS;
  await launch();
  await until(() => openTabs().length === 2, "both tabs");
  expect(openTabs()).toEqual(["guide.md", "ideas.md"]);
  await closeWorkspace();
  await until(() => open() === undefined, "the workspace to close");
  expect(openTabs()).toEqual([]);
});

test("Reopen closed tab stays with its workspace", async () => {
  await launch();
  await enter("Handbook");
  await openDoc("guide.md");
  await openDoc("spec.md");
  await click(host.querySelector('[aria-label^="Close spec.md"]'));
  await until(() => openTabs().length === 1, "the tab to close");
  await enter("Notes");
  await openDoc("ideas.md");
  await key("T", { ctrlKey: true, shiftKey: true });
  await settle();
  expect(openTabs()).toEqual(["ideas.md"]);
  await enter("Handbook");
  await until(() => shownTab() === "guide.md", "the tabs back");
  await key("T", { ctrlKey: true, shiftKey: true });
  await until(() => openTabs().length === 2, "the tab to reopen");
  expect(openTabs()).toEqual(["guide.md", "spec.md"]);
});

test("a document opened from outside joins the tabs of whatever is open", async () => {
  await launch();
  await enter("Handbook");
  await openDoc("guide.md");
  await act(async () => void (await emit("open-file", IDEAS)));
  await until(() => openTabs().length === 2, "the tab");
  await enter("Notes");
  expect(openTabs()).toEqual([]);
  await closeWorkspace();
  await until(() => open() === undefined, "the workspace to close");
  await act(async () => void (await emit("open-file", SPEC)));
  await until(() => openTabs().length === 1, "the tab");
  expect(openTabs()).toEqual(["spec.md"]);
});

test("the same document in two workspaces keeps no edits or save state across the switch", async () => {
  await launch(AUTOSAVE_OFF);
  await enter("Handbook");
  await openDoc("shared.md");
  await enter("Notes");
  await openDoc("shared.md");

  // Edited in Notes and saved: Handbook shows the saved text and no sign of the edit.
  await startEditing();
  await type("From Notes.");
  await enter("Handbook");
  await until(() => shownTab() === "shared.md" && article().includes("From Notes."), "the saved text");
  expect(host.querySelector(".ProseMirror")).toBeNull();
  expect(status()).toBe("Reading");
  expect(host.querySelector(".unsaved-dot")).toBeNull();

  // Edited in Handbook and dropped: Notes shows the file.
  choice = "Don't save";
  await startEditing();
  const p = all(".ProseMirror p").find((el) => el.textContent?.includes("From Notes"))!;
  await act(async () => void (p.firstChild!.nodeValue = "Dropped."));
  await until(() => host.querySelector<HTMLElement>("button.save-state")?.dataset.state === "unsaved", "the edit to register");
  await enter("Notes");
  await until(() => article().includes("From Notes."), "the file's text");
  expect(article()).not.toContain("Dropped.");
  expect(status()).toBe("Reading");

  // An edit after coming back is made to the file as it is now, so it saves.
  choice = "Save";
  await startEditing();
  const again = all(".ProseMirror p").find((el) => el.textContent?.includes("From Notes"))!;
  await act(async () => void (again.firstChild!.nodeValue = "Last edit."));
  await until(() => host.querySelector<HTMLElement>("button.save-state")?.dataset.state === "unsaved", "the edit to register");
  await click(host.querySelector(".done-btn"));
  await until(() => disk.get(SHARED) === text("shared.md", "Last edit."), "the save");
  expect(host.querySelector(".conflict")).toBeNull();
});

test("the same document edited with autosave on arrives saved in the other workspace", async () => {
  await launch();
  await enter("Handbook");
  await openDoc("shared.md");
  await enter("Notes");
  await openDoc("shared.md");
  await startEditing();
  await type("From Notes.");
  await enter("Handbook");
  await until(() => article().includes("From Notes."), "the saved text");
  await settle(1300);
  expect(writes).toEqual([text("shared.md", "From Notes.")]);
  expect(host.querySelector(".conflict")).toBeNull();
});

test("only the shown tabs are watched, and a change made while a tab was away shows when it comes back", async () => {
  await launch();
  await enter("Handbook");
  await openDoc("spec.md");
  await openDoc("guide.md");
  await until(() => watched.length === 2, "the watcher");
  expect(new Set(watched)).toEqual(new Set([GUIDE, SPEC]));
  await enter("Notes");
  await until(() => watched.length === 0, "the watcher to stop");
  await openDoc("ideas.md");
  await until(() => watched.length === 1, "the watcher");
  expect(watched).toEqual([IDEAS]);

  disk.set(GUIDE, text("guide.md", "Changed while away."));
  disk.set(SPEC, text("spec.md", "Changed while away too."));
  await enter("Handbook");
  await until(() => new Set(watched).has(GUIDE), "the watcher");
  expect(watched).toHaveLength(2);
  await until(() => article().includes("Changed while away."), "the new text");
  await click(byText(".tab", "spec.md")?.querySelector(".tab-open"));
  await until(() => article().includes("Changed while away too."), "the other tab's new text");
});

test("a change reported for a document left behind doesn't reach the tabs shown, and a later one shows on return", async () => {
  await launch();
  await enter("Handbook");
  await openDoc("guide.md");
  await act(async () => void (await emit("doc-changed", GUIDE)));
  await enter("Notes");
  await settle(300);
  expect(openTabs()).toEqual([]);
  disk.set(GUIDE, text("guide.md", "Changed while away."));
  await enter("Handbook");
  await until(() => article().includes("Changed while away."), "the new text");
});

test("a file that was missing is read again when its tab comes back", async () => {
  disk.delete(GUIDE);
  localStorage.setItem("workspace", JSON.stringify("h"));
  localStorage.setItem("tabs:h", JSON.stringify({ tabs: [{ entries: [{ path: GUIDE, scroll: 0 }], index: 0 }], active: 0 }));
  await launch();
  await until(() => host.querySelector(".error.banner"), "the error");
  await enter("Notes");
  disk.set(GUIDE, text("guide.md"));
  await enter("Handbook");
  await until(() => article().includes("guide.md"), "the document");
  expect(host.querySelector(".error.banner")).toBeNull();
});

/** Starts with `file` open in the tabs of no workspace and the Files tab's offer showing. */
async function showOffer(file: string, prefs: object = {}) {
  initialFile = file;
  await launch(prefs);
  await until(() => host.querySelector("article h1"), "the document");
  initialFile = null;
  await click(byText(".seg button", "Files"));
  await until(() => byText("button", "Choose folder…"), "the offer");
}

test("the offer's folder button opens the workspace with the shown document as its shown tab, and it stays in the tabs of no workspace", async () => {
  await showOffer(SHARED);
  await click(byText("button", "Open docs folder"));
  await until(() => open() === "docs", "the workspace");
  await until(() => shownTab() === "shared.md", "the carried tab");
  expect(openTabs()).toEqual(["shared.md"]);
  await until(() => host.querySelector("article h1")?.textContent?.includes("shared.md"), "the document");
  await closeWorkspace();
  await until(() => open() === undefined, "the workspace to close");
  expect(openTabs()).toEqual(["shared.md"]);
  expect(shownTab()).toBe("shared.md");
});

test("Choose folder… carries the shown document too", async () => {
  await showOffer(SHARED);
  picked = NOTES;
  await click(byText("button", "Choose folder…"));
  await until(() => open() === "Notes", "the workspace");
  await until(() => shownTab() === "shared.md", "the carried tab");
  expect(openTabs()).toEqual(["shared.md"]);
});

test("a workspace that has tabs gets the document added after the shown one, and shows it", async () => {
  await launch();
  await enter("Notes");
  await openDoc("ideas.md");
  await closeWorkspace();
  await until(() => open() === undefined, "the workspace to close");
  await act(async () => void (await emit("open-file", SHARED)));
  await until(() => shownTab() === "shared.md", "the document");
  await click(byText(".seg button", "Files"));
  await until(() => byText("button", "Choose folder…"), "the offer");
  picked = NOTES;
  await click(byText("button", "Choose folder…"));
  await until(() => open() === "Notes", "the workspace");
  await until(() => shownTab() === "shared.md", "the carried tab");
  expect(openTabs()).toEqual(["ideas.md", "shared.md"]);
});

test("a workspace that already has the document in a tab shows that tab instead of adding one", async () => {
  await launch();
  await enter("Notes");
  await openDoc("shared.md");
  await openDoc("ideas.md");
  await closeWorkspace();
  await until(() => open() === undefined, "the workspace to close");
  await act(async () => void (await emit("open-file", SHARED)));
  await until(() => shownTab() === "shared.md", "the document");
  await click(byText(".seg button", "Files"));
  await until(() => byText("button", "Choose folder…"), "the offer");
  picked = NOTES;
  await click(byText("button", "Choose folder…"));
  await until(() => open() === "Notes", "the workspace");
  await until(() => openTabs().length === 2, "the tabs");
  expect(openTabs()).toEqual(["shared.md", "ideas.md"]);
  await until(() => shownTab() === "shared.md", "the shown tab");
});

test("the offer settles unsaved edits first, then carries the document", async () => {
  await showOffer(GUIDE);
  await startEditing();
  await type("Changed text.");
  await click(byText("button", "Open Handbook folder"));
  await until(() => open() === "Handbook", "the workspace");
  expect(disk.get(GUIDE)).toBe(EDITED);
  await until(() => shownTab() === "guide.md", "the carried tab");
  expect(openTabs()).toEqual(["guide.md"]);
  expect(host.querySelector(".ProseMirror")).toBeNull();
});

test("Cancel on the offer's question changes nothing", async () => {
  choice = "Cancel";
  await showOffer(GUIDE, AUTOSAVE_OFF);
  await startEditing();
  await type("Changed text.");
  await click(byText("button", "Open Handbook folder"));
  await until(() => questions.length, "the question");
  await settle();
  expect(open()).toBeUndefined();
  expect(writes).toEqual([]);
  expect(openTabs()).toEqual(["guide.md"]);
  expect(host.querySelector(".ProseMirror")).not.toBeNull();
  expect(stored).toHaveLength(2);
});

test("Open folder… on Home and in the workspace menu carry nothing", async () => {
  await showOffer(SHARED);
  await click(host.querySelector('[aria-label="Home"]'));
  picked = NOTES;
  await click(byText("button", "Open folder…"));
  await until(() => open() === "Notes", "the workspace");
  expect(openTabs()).toEqual([]);
  await openDoc("ideas.md");
  picked = ROOT;
  await click(host.querySelector(".status-workspace"));
  await click(byText(".menu button", "Open folder…"));
  await until(() => open() === "Handbook", "the other workspace");
  expect(openTabs()).toEqual([]);
});

test("removing the open workspace goes through the close path: Cancel keeps it, and its edits", async () => {
  choice = "Cancel";
  agree = true;
  await editGuide(AUTOSAVE_OFF);
  await click(host.querySelector("[aria-label=Home]"));
  await click(host.querySelector("[aria-label='More for Handbook']"));
  await click(byText(".menu button", "Remove workspace"));
  await until(() => questions.length, "the question");
  await settle();
  expect(open()).toBe("Handbook");
  expect(stored).toHaveLength(2);
  expect(localStorage.getItem("tabs:h")).not.toBeNull();
});

test("removing the open workspace saves its edits first", async () => {
  agree = true;
  await editGuide();
  await click(host.querySelector("[aria-label=Home]"));
  await click(host.querySelector("[aria-label='More for Handbook']"));
  await click(byText(".menu button", "Remove workspace"));
  await until(() => open() === undefined, "the workspace to close");
  expect(disk.get(GUIDE)).toBe(EDITED);
  await until(() => (stored as { id: string }[]).every((w) => w.id !== "h"), "the save");
  await settle();
  expect(localStorage.getItem("tabs:h")).toBeNull();
});
