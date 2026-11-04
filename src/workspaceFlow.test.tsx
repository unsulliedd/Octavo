// @vitest-environment jsdom
// Workspaces through the whole App: a fake disk and saved file stand behind the mocked IPC.
import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import App from "./App";
import { answerDialogs } from "./dialogTesting";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ROOT = "C:\\docs\\Handbook";
const NOTES = "C:\\docs\\Notes";
const GUIDE = `${ROOT}\\guide.md`;
const SPEC = `${ROOT}\\specs\\spec.md`;
const IDEAS = `${NOTES}\\ideas.md`;
const saved = (id: string, path: string) => ({ id, name: path.split("\\").pop()!, items: [{ kind: "folder", path }], removed: [] });

type Scan = { files: string[]; truncated: boolean };
type Held = { path: string; showHidden: boolean; finish: (result?: Scan | string) => void };

let host: HTMLElement;
let root: Root;
let calls: string[];
/** The scans by folder: the files, or the error message of a folder that can't be read. */
let folders: Map<string, Scan | string>;
/** What the saved file holds, and each list written to it. */
let stored: unknown[];
let saves: { id: string }[][];
let loadProblem: { reason: string; copy: string } | null;
let loadRefusal: string | undefined;
let saveProblem: { reason: string; copy: string } | null;
let saveRefusal: string | undefined;
let finishLoad: Promise<void> | undefined;
let saveGate: Promise<void> | undefined;
/** While set, scans wait here until a test finishes them. */
let held: Held[] | undefined;
let picked: string | null;
let dialogs: { directory?: boolean; defaultPath?: string }[];
let told: { message: string }[];
let stopAnswering: () => void;
let initialFile: string | null;
let gitRoot: string | undefined;
/** Added documents gone from disk. */
let gone: string[];
let asked: string[];
let agree: boolean;
let filePicked: string | null;

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
  calls = [];
  folders = new Map<string, Scan | string>([
    [ROOT, { files: [GUIDE, SPEC], truncated: false }],
    [NOTES, { files: [IDEAS], truncated: false }],
  ]);
  stored = [];
  saves = [];
  loadProblem = null;
  loadRefusal = undefined;
  saveProblem = null;
  saveRefusal = undefined;
  finishLoad = undefined;
  saveGate = undefined;
  held = undefined;
  picked = null;
  dialogs = [];
  told = [];
  initialFile = null;
  gitRoot = undefined;
  gone = [];
  asked = [];
  agree = false;
  stopAnswering = answerDialogs((text, labels) => {
    if (labels.length === 1) {
      told.push({ message: text });
      return labels[0];
    }
    asked.push(text);
    return agree ? labels[0] : labels[1];
  });
  filePicked = null;
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
  Element.prototype.scrollTo = () => {};
  Element.prototype.scrollIntoView = () => {};
  vi.spyOn(console, "warn").mockImplementation(() => {});
  mockWindows("main");
  mockIPC(
    async (cmd, args) => {
      const a = (args ?? {}) as Record<string, any>;
      calls.push(cmd);
      switch (cmd) {
        case "plugin:app|version":
          return "0.0.0";
        case "initial_file":
          return initialFile;
        case "open_doc":
          return { path: a.path, text: `# ${a.path.split("\\").pop()}\n` };
        case "load_workspaces":
          await finishLoad;
          if (loadRefusal) throw loadRefusal;
          return { workspaces: stored, problem: loadProblem };
        case "save_workspaces":
          if (saveRefusal) throw saveRefusal;
          await saveGate;
          stored = a.workspaces;
          saves.push(a.workspaces);
          return saveProblem;
        case "workspace_folder":
          return gitRoot ?? a.dir;
        case "missing_documents":
          return a.paths.filter((p: string) => gone.includes(p));
        case "scan_folder": {
          const result = await new Promise<Scan | string | undefined>((finish) =>
            held ? held.push({ path: a.path, showHidden: a.showHidden, finish }) : finish(folders.get(a.path)),
          );
          const final = result ?? folders.get(a.path) ?? "No such folder";
          if (typeof final === "string") throw final;
          return final;
        }
        case "plugin:dialog|open":
          dialogs.push(a.options);
          return a.options.directory ? picked : filePicked;
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

async function launch() {
  localStorage.setItem("prefs", localStorage.getItem("prefs") ?? "{}");
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<App />));
  await until(() => calls.includes("initial_file"), "the app to start");
  await settle();
}

async function restart() {
  await act(async () => root.unmount());
  host.remove();
  calls = [];
  await launch();
}

const all = <T extends Element = HTMLElement>(selector: string) => [...host.querySelectorAll<T>(selector)];
const byText = (selector: string, text: string) => all(selector).find((el) => el.textContent?.trim() === text);
const click = (el: Element | null | undefined) => {
  if (!el) throw new Error("Nothing to click");
  return act(async () => void (el as HTMLElement).click());
};
const clickText = (text: string) => click(byText("button", text));
const rows = () => all(".tree-row").map((r) => r.textContent);
const tree = () => host.querySelector(".tree");
const focusWindow = () => act(async () => void window.dispatchEvent(new Event("focus")));
const scans = () => calls.filter((c) => c === "scan_folder").length;
const openTabs = () => all(".tab").map((t) => t.textContent);

async function openFolder(path: string) {
  picked = path;
  await clickText("Open folder…");
  await until(() => byText(".status-workspace", path.split("\\").pop()!), "the workspace to open");
  await until(() => !host.querySelector(".files-note[role=status]"), "the scan to finish");
}

const hold = () => (held = []);
const release = async (i = 0, result?: Scan | string) => {
  const [scan] = held!.splice(i, 1);
  await act(async () => scan.finish(result));
  await settle();
};

test("with no workspace open, nothing is scanned or saved and the sidebar is the outline beside the document", async () => {
  initialFile = GUIDE;
  await launch();
  await until(() => host.querySelector("article h1"), "the document");
  expect(host.querySelector(".outline")?.textContent).toContain("guide.md");
  expect(byText(".seg button", "Outline")?.getAttribute("aria-pressed")).toBe("true");
  await focusWindow();
  await settle();
  expect(calls).not.toContain("scan_folder");
  expect(calls).not.toContain("save_workspaces");
  expect(calls).not.toContain("workspace_folder");
  expect(localStorage.getItem("workspace")).toBeNull();
  expect(host.querySelector(".status-workspace")).toBeNull();
  expect(host.querySelector(".tree")).toBeNull();
});

test("with no workspace open and no document, Home has no sidebar and no sidebar button", async () => {
  await launch();
  expect(host.querySelector(".home")).not.toBeNull();
  expect(host.querySelector(".sidebar")).toBeNull();
  expect(host.querySelector('[aria-label="Show sidebar"]')).toBeNull();
  expect(host.querySelector("#workspaces-h")).toBeNull();
  expect(byText("button", "Open folder…")).toBeDefined();
});

test("Open folder picks a folder in one step and shows its documents", async () => {
  await launch();
  await openFolder(ROOT);
  expect(dialogs).toEqual([expect.objectContaining({ directory: true })]);
  expect(host.querySelector(".workspace-name")?.textContent).toBe("Handbook");
  expect(rows()).toEqual(["Handbook", "specs", "spec.md", "guide.md"]);
  expect(saves).toEqual([[expect.objectContaining({ name: "Handbook", items: [{ kind: "folder", path: ROOT }] }), expect.objectContaining({ id: "pinned" })]]);
  expect(localStorage.getItem("workspace")).toBe(JSON.stringify((stored[0] as { id: string }).id));
});

test("a saved file that couldn't be read is not written over", async () => {
  loadRefusal = "Access is denied";
  await launch();
  await openFolder(ROOT);
  expect(host.querySelector(".workspace-name")?.textContent).toBe("Handbook");
  expect(calls).not.toContain("save_workspaces");
});

test("cancelling the picker opens nothing", async () => {
  await launch();
  await clickText("Open folder…");
  await settle();
  expect(host.querySelector(".sidebar")).toBeNull();
  expect(calls).not.toContain("save_workspaces");
});

test("a document opens from the tree through the normal path and joins the recent files", async () => {
  await launch();
  await openFolder(ROOT);
  await click(byText(".tree-row", "guide.md"));
  await until(() => host.querySelector("article h1"), "the document");
  expect(openTabs()).toEqual(["guide.md"]);
  expect(JSON.parse(localStorage.getItem("recent")!)[0].path).toBe(GUIDE);
  expect(byText(".tree-row", "guide.md")?.getAttribute("aria-current")).toBe("page");
  expect(byText(".seg button", "Files")?.getAttribute("aria-pressed")).toBe("true");
});

test("opening the same folder again finds the same workspace", async () => {
  stored = [saved("h", ROOT)];
  await launch();
  picked = "c:\\DOCS\\handbook\\";
  await clickText("Open folder…");
  await until(() => rows().includes("guide.md"), "the tree");
  expect(saves).toEqual([]);
  expect(host.querySelector(".workspace-name")?.textContent).toBe("Handbook");
  expect(all("#workspaces-h + ul .file-name")).toHaveLength(1);
});

test("Home lists workspaces most recent first, opens one with a click and marks the open one", async () => {
  stored = [saved("n", NOTES), saved("h", ROOT)];
  await launch();
  const names = () => all("[aria-labelledby=workspaces-h] .file-name").map((n) => n.textContent);
  expect(names()).toEqual(["Notes", "Handbook"]);
  expect(host.querySelector("[aria-labelledby=workspaces-h] .file-when")).toBeNull();
  expect(host.querySelector("[aria-labelledby=workspaces-h] .file-folder")?.textContent).toBe("C: › docs › Notes");
  await click(byText("[aria-labelledby=workspaces-h] .file-open .file-name", "Handbook"));
  await until(() => rows().includes("guide.md"), "the tree");
  expect(names()).toEqual(["Handbook", "Notes"]);
  expect(saves.map((s) => s.map((w) => w.id))).toEqual([["h", "n", "pinned"]]);
  expect(host.querySelector("[aria-labelledby=workspaces-h] .file-when")?.textContent).toBe("Open");
});

test("a workspace with no document shows the sidebar beside Home, with Outline turned off", async () => {
  stored = [saved("h", ROOT)];
  await launch();
  await openFolder(ROOT);
  expect(host.querySelector(".home")).not.toBeNull();
  expect(host.querySelector(".sidebar .tree")).not.toBeNull();
  expect(byText(".seg button", "Outline")).toHaveProperty("disabled", true);
  await click(host.querySelector('[aria-label="Show sidebar"]'));
  expect(host.querySelector(".sidebar")).toBeNull();
  await click(host.querySelector('[aria-label="Show sidebar"]'));
  expect(host.querySelector(".sidebar .tree")).not.toBeNull();
});

test("the open workspace survives a restart", async () => {
  await launch();
  await openFolder(ROOT);
  saves = [];
  await restart();
  await until(() => rows().includes("guide.md"), "the tree after the restart");
  expect(host.querySelector(".workspace-name")?.textContent).toBe("Handbook");
  expect(saves).toEqual([]);
});

test("a saved open workspace that no longer exists leaves none open", async () => {
  localStorage.setItem("workspace", JSON.stringify("gone"));
  stored = [saved("h", ROOT)];
  await launch();
  expect(host.querySelector(".sidebar")).toBeNull();
  expect(calls).not.toContain("scan_folder");
});

test("the scan shows a clear state, then the tree, and an unreadable root an error", async () => {
  await launch();
  hold();
  picked = ROOT;
  await clickText("Open folder…");
  await until(() => held!.length, "the scan to start");
  expect(host.querySelector(".files-note[role=status]")?.textContent).toBe("Scanning Handbook…");
  expect(tree()).toBeNull();
  await release();
  expect(host.querySelector(".files-note")).toBeNull();
  expect(rows()).toContain("guide.md");

  await click(host.querySelector('[aria-label="Refresh"]'));
  await until(() => held!.length, "the rescan to start");
  await release(0, "Access is denied. (os error 5)");
  expect(host.querySelector(".files-note[role=alert]")?.textContent).toBe(`Couldn't read ${ROOT}: Access is denied. (os error 5)`);
  expect(rows()).toEqual([]);
  expect(host.querySelector(".workspace-name")).not.toBeNull();
});

test("a scan that was cut off says so, and an empty one says there are no documents", async () => {
  folders.set(ROOT, { files: [GUIDE], truncated: true });
  folders.set(NOTES, { files: [], truncated: false });
  await launch();
  await openFolder(ROOT);
  expect(host.querySelector(".files-note")?.textContent).toContain("some documents may be missing");
  expect(rows()).toContain("guide.md");
  await click(host.querySelector(".workspace-name"));
  picked = NOTES;
  await clickText("Open folder…");
  await until(() => host.querySelector(".workspace-name")?.textContent === "Notes", "the other workspace");
  await until(() => byText(".files-note", "No Markdown documents in this workspace."), "the empty note");
});

test("the latest scan wins, whichever finishes first", async () => {
  stored = [saved("h", ROOT)];
  await launch();
  await openFolder(ROOT);
  hold();
  await focusWindow();
  await click(host.querySelector('[aria-label="Refresh"]'));
  await until(() => held!.length === 2, "both scans to start");
  await release(1, { files: [IDEAS.replace(NOTES, ROOT)], truncated: false });
  expect(rows()).toEqual(["Handbook", "ideas.md"]);
  await release(0, { files: [GUIDE], truncated: false });
  expect(rows()).toEqual(["Handbook", "ideas.md"]);
});

test("a scan of the workspace left behind doesn't show in the next one", async () => {
  stored = [saved("n", NOTES), saved("h", ROOT)];
  await launch();
  hold();
  await click(byText("[aria-labelledby=workspaces-h] .file-name", "Handbook"));
  await until(() => held!.length, "the first scan");
  await click(byText("[aria-labelledby=workspaces-h] .file-name", "Notes"));
  await until(() => held!.length === 2, "the second scan");
  await release(1);
  await release(0);
  expect(rows()).toEqual(["Notes", "ideas.md"]);
});

test("a rescan on focus keeps the tree in place, with no scanning state", async () => {
  await launch();
  await openFolder(ROOT);
  const row = byText(".tree-row", "guide.md");
  const before = scans();
  hold();
  await focusWindow();
  await until(() => held!.length, "the focus rescan");
  expect(scans()).toBe(before + 1);
  expect(host.querySelector(".files-note")).toBeNull();
  expect(host.querySelector('[aria-label="Refresh"]')?.hasAttribute("data-busy")).toBe(false);
  expect(byText(".tree-row", "guide.md")).toBe(row);
  await release();
  expect(byText(".tree-row", "guide.md")).toBe(row);
});

test("a rescan on focus shows a new document", async () => {
  await launch();
  await openFolder(ROOT);
  folders.set(ROOT, { files: [GUIDE, SPEC, `${ROOT}\\new.md`], truncated: false });
  await focusWindow();
  await until(() => rows().includes("new.md"), "the new document");
});

test("Refresh shows it is busy until the scan is done", async () => {
  await launch();
  await openFolder(ROOT);
  hold();
  const refresh = host.querySelector('[aria-label="Refresh"]');
  await click(refresh);
  expect(refresh?.hasAttribute("data-busy")).toBe(true);
  await until(() => held!.length, "the rescan");
  await release();
  expect(refresh?.hasAttribute("data-busy")).toBe(false);
});

test("folders stay open or closed across a rescan", async () => {
  folders.set(ROOT, { files: [GUIDE, SPEC, `${ROOT}\\drafts\\a.md`], truncated: false });
  await launch();
  await openFolder(ROOT);
  await click(byText(".tree-row", "specs"));
  expect(rows()).not.toContain("spec.md");
  expect(byText(".tree-row", "specs")?.getAttribute("aria-expanded")).toBe("false");
  folders.set(ROOT, { files: [GUIDE, SPEC, `${ROOT}\\drafts\\a.md`, `${ROOT}\\drafts\\b.md`], truncated: false });
  await click(host.querySelector('[aria-label="Refresh"]'));
  await until(() => rows().includes("b.md"), "the rescan");
  expect(rows()).not.toContain("spec.md");
  expect(rows()).toContain("a.md");
  await click(byText(".tree-row", "specs"));
  expect(rows()).toContain("spec.md");
});

test("folders closed by hand stay closed after a visit to the Outline tab", async () => {
  await launch();
  await openFolder(ROOT);
  await click(byText(".tree-row", "guide.md"));
  await until(() => host.querySelector("article h1"), "the document");
  await click(byText(".tree-row", "specs"));
  await click(byText(".seg button", "Outline"));
  expect(tree()).toBeNull();
  expect(host.querySelector(".outline")).not.toBeNull();
  await click(byText(".seg button", "Files"));
  expect(rows()).not.toContain("spec.md");
});

test("a large workspace starts with the folders below the top closed", async () => {
  const files = Array.from({ length: 501 }, (_, i) => `${ROOT}\\specs\\${i}.md`);
  folders.set(ROOT, { files, truncated: false });
  await launch();
  await openFolder(ROOT);
  expect(rows()).toEqual(["Handbook", "specs"]);
  await click(byText(".tree-row", "specs"));
  expect(rows()).toHaveLength(503);
});

test("with no workspace open, the Files tab names the repository folder and opens nothing by itself", async () => {
  initialFile = GUIDE;
  gitRoot = "C:\\docs";
  await launch();
  await until(() => host.querySelector("article h1"), "the document");
  await click(byText(".seg button", "Files"));
  await until(() => byText("button", "Open docs folder"), "the offer");
  expect(calls).not.toContain("scan_folder");
  expect(calls).not.toContain("save_workspaces");
  expect(host.querySelector(".files-offer-folder > span")?.textContent).toBe("C: › docs");
  await click(byText("button", "Open docs folder"));
  await until(() => host.querySelector(".workspace-name")?.textContent === "docs", "the workspace");
  expect(dialogs).toEqual([]);
  expect(openTabs()).toEqual(["guide.md"]);
});

test("the offer names the document's own folder outside a repository, and Choose folder starts there", async () => {
  initialFile = GUIDE;
  await launch();
  await until(() => host.querySelector("article h1"), "the document");
  await click(byText(".seg button", "Files"));
  await until(() => byText("button", "Open Handbook folder"), "the offer");
  await clickText("Choose folder…");
  await until(() => dialogs.length, "the picker");
  expect(dialogs).toEqual([expect.objectContaining({ directory: true, defaultPath: ROOT })]);
  expect(calls).not.toContain("save_workspaces");
});

test("the workspace menu switches workspaces, and each has its own tabs", async () => {
  stored = [saved("h", ROOT), saved("n", NOTES)];
  await launch();
  await openFolder(ROOT);
  await click(byText(".tree-row", "guide.md"));
  await until(() => host.querySelector("article h1"), "the document");
  await click(host.querySelector(".workspace-name"));
  expect(all(".menu [role=menuitemradio]").map((i) => [i.textContent, i.getAttribute("aria-checked")])).toEqual([
    ["Pinned", "false"],
    ["Handbook", "true"],
    ["Notes", "false"],
  ]);
  // Pinned stands apart: a separator follows it, and another comes before the actions.
  expect(all(".menu > *").map((el) => (el.getAttribute("role") === "separator" ? "|" : el.textContent))).toEqual([
    "Pinned",
    "|",
    "Handbook",
    "Notes",
    "|",
    "Open folder…",
    "Close workspace",
  ]);
  await click(byText(".menu [role=menuitemradio]", "Notes"));
  await until(() => rows().includes("ideas.md"), "the other tree");
  expect(openTabs()).toEqual([]);
  expect(host.querySelector(".home")).not.toBeNull();
  expect(byText(".tree-row", "ideas.md")?.getAttribute("aria-current")).toBeNull();
  expect(host.querySelector(".status-workspace")?.textContent).toBe("Notes");
});

test("the status bar opens the same menu, and a second click closes it", async () => {
  stored = [saved("h", ROOT)];
  await launch();
  await openFolder(ROOT);
  const status = host.querySelector(".status-workspace")!;
  await click(status);
  expect(status.getAttribute("aria-expanded")).toBe("true");
  expect(host.querySelector(".workspace-name")?.getAttribute("aria-expanded")).toBe("false");
  expect(byText(".menu button", "Close workspace")).toBeDefined();
  await act(async () => void status.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));
  expect(host.querySelector(".menu")).not.toBeNull();
  await click(status);
  expect(host.querySelector(".menu")).toBeNull();
  await click(host.querySelector(".workspace-name"));
  expect(host.querySelector(".workspace-name")?.getAttribute("aria-expanded")).toBe("true");
  expect(status.getAttribute("aria-expanded")).toBe("false");
});

test("closing the workspace brings back the tabs of no workspace and the outline, and stays closed after a restart", async () => {
  initialFile = IDEAS;
  await launch();
  await until(() => host.querySelector("article h1"), "the document");
  initialFile = null;
  await click(byText(".seg button", "Files"));
  picked = ROOT;
  await click(byText("button", "Choose folder…"));
  await until(() => rows().includes("guide.md"), "the tree");
  await click(byText(".tree-row", "guide.md"));
  await until(() => host.querySelector("article h1"), "the document");
  await click(host.querySelector(".workspace-name"));
  await click(byText(".menu button", "Close workspace"));
  await until(() => host.querySelector("article h1"), "the document");
  expect(openTabs()).toEqual(["ideas.md"]);
  expect(host.querySelector(".status-workspace")).toBeNull();
  expect(host.querySelector(".outline")).not.toBeNull();
  await restart();
  expect(host.querySelector(".status-workspace")).toBeNull();
  expect(all("[aria-labelledby=workspaces-h] .file-name")).toHaveLength(0);
});

test("the workspace stays saved after it is closed", async () => {
  await launch();
  await openFolder(ROOT);
  await click(host.querySelector(".workspace-name"));
  await click(byText(".menu button", "Close workspace"));
  await until(() => !host.querySelector(".sidebar"), "the sidebar to close");
  expect(all("[aria-labelledby=workspaces-h] .file-name").map((n) => n.textContent)).toEqual(["Handbook"]);
});

test("a scan that ends after the workspace closed shows nothing and Refresh isn't left busy", async () => {
  await launch();
  await openFolder(ROOT);
  hold();
  await click(host.querySelector('[aria-label="Refresh"]'));
  await until(() => held!.length, "the rescan");
  await click(host.querySelector(".workspace-name"));
  await click(byText(".menu button", "Close workspace"));
  await focusWindow();
  await release();
  picked = ROOT;
  await clickText("Open folder…");
  await until(() => held!.length, "the scan of the reopened workspace");
  expect(host.querySelector('[aria-label="Refresh"]')?.hasAttribute("data-busy")).toBe(false);
  await release();
});

test("Show hidden folders is off by default, and turning it on rescans with it", async () => {
  await launch();
  hold();
  picked = ROOT;
  await clickText("Open folder…");
  await until(() => held!.length, "the scan");
  expect(held![0].showHidden).toBe(false);
  await release();
  await click(host.querySelector('[aria-label="Settings"]'));
  const box = byText(".setting-row", "Show hidden foldersWorkspaces also list folders whose names start with a dot, such as .github.")!.querySelector("input")!;
  expect(box.checked).toBe(false);
  await click(box);
  await until(() => held!.length, "the rescan");
  expect(held![0].showHidden).toBe(true);
  await release();
});

test("a saved file that can't be used says once where the copy is", async () => {
  const copy = "C:\\data\\workspaces.corrupt.json";
  loadProblem = { reason: "corrupt", copy };
  saveProblem = loadProblem;
  await launch();
  await until(() => told.length, "the message");
  expect(told[0].message).toContain(copy);
  expect(told[0].message).toContain("couldn't be read");
  await openFolder(ROOT);
  await until(() => saves.length, "the save");
  await settle();
  expect(told).toHaveLength(1);
  await restart();
  await settle();
  expect(told).toHaveLength(1);
});

test("a problem first reported by a save says where the copy is", async () => {
  saveProblem = { reason: "newer", copy: "C:\\data\\workspaces.newer.json" };
  await launch();
  await openFolder(ROOT);
  await until(() => told.length, "the message");
  expect(told[0].message).toContain("newer version");
  expect(told[0].message).toContain(saveProblem.copy);
});

test("a saved file that can't be read says so once", async () => {
  loadRefusal = "Access is denied.";
  await launch();
  await until(() => told.length, "the load message");
  expect(told[0].message).toContain("couldn't be read");
  expect(told[0].message).toContain("Access is denied.");
  await openFolder(ROOT);
  await settle();
  expect(told).toHaveLength(1);
});

test("a failed save says so once, and the workspaces still work", async () => {
  saveRefusal = "Access is denied.";
  await launch();
  await openFolder(ROOT);
  await until(() => told.length === 1, "the save message");
  expect(told[0].message).toContain("couldn't be saved");
  await openFolder(NOTES);
  await settle();
  expect(told).toHaveLength(1);
  expect(rows()).toContain("ideas.md");
});

test("a folder opened while the saved list loads joins it, and nothing saved is lost", async () => {
  stored = [saved("n", NOTES)];
  let finish = () => {};
  finishLoad = new Promise((done) => (finish = done));
  await launch();
  picked = ROOT;
  await clickText("Open folder…");
  await settle();
  expect(calls).not.toContain("save_workspaces");
  await act(async () => finish());
  await until(() => saves.length, "the save");
  expect(saves[0].map((w: { id: string }) => w.id)).toContain("n");
  expect(saves[0]).toHaveLength(3);
});

test("saves run in order, so the last list written is the latest", async () => {
  let finish = () => {};
  saveGate = new Promise((done) => (finish = done));
  await launch();
  await openFolder(ROOT);
  await openFolder(NOTES);
  await settle();
  expect(calls.filter((c) => c === "save_workspaces")).toHaveLength(1);
  await act(async () => finish());
  await until(() => saves.length === 2, "both saves");
  expect(saves[1].map((w) => (w as unknown as { name: string }).name)).toEqual(["Notes", "Handbook", "Pinned"]);
});

test("opening the workspace that is already open scans it again", async () => {
  stored = [saved("h", ROOT)];
  await launch();
  await openFolder(ROOT);
  const before = scans();
  await click(byText("[aria-labelledby=workspaces-h] .file-name", "Handbook"));
  await until(() => scans() === before + 1, "the rescan");
});

test("the tab picked by hand is forgotten when a workspace opens or closes", async () => {
  initialFile = GUIDE;
  await launch();
  await until(() => host.querySelector("article h1"), "the document");
  await click(byText(".seg button", "Files"));
  await until(() => byText("button", "Open Handbook folder"), "the offer");
  await click(byText("button", "Open Handbook folder"));
  await until(() => rows().includes("guide.md"), "the tree");
  await click(byText(".tree-row", "guide.md"));
  await until(() => host.querySelector("article h1"), "the document");
  await click(byText(".seg button", "Outline"));
  picked = NOTES;
  await click(host.querySelector(".workspace-name") ?? host.querySelector(".status-workspace"));
  await click(byText(".menu button", "Open folder…"));
  await until(() => rows().includes("ideas.md"), "the other tree");
  await click(host.querySelector(".workspace-name"));
  await click(byText(".menu button", "Close workspace"));
  await until(() => host.querySelector(".outline"), "the outline");
});

test("a saved sidebar width applies to Files and Outline and comes back after a restart", async () => {
  await launch();
  await openFolder(ROOT);
  await click(byText(".tree-row", "guide.md"));
  await until(() => host.querySelector("article h1"), "the document");
  const aside = () => host.querySelector<HTMLElement>(".sidebar")!;
  expect(aside().style.width).toBe("252px");
  const press = new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true });
  await act(async () => void host.querySelector("[role=separator]")!.dispatchEvent(press));
  expect(aside().style.width).toBe("268px");
  expect(JSON.parse(localStorage.getItem("prefs")!).sidebarWidth).toBe(268);
  await click(byText(".seg button", "Outline"));
  expect(aside().style.width).toBe("268px");
  await restart();
  await until(() => host.querySelector(".sidebar"), "the sidebar");
  expect(aside().style.width).toBe("268px");
});

test("a stored sidebar width that isn't a number is the usual width", async () => {
  localStorage.setItem("prefs", JSON.stringify({ sidebarWidth: "wide" }));
  stored = [saved("h", ROOT)];
  await launch();
  await openFolder(ROOT);
  expect(host.querySelector<HTMLElement>(".sidebar")!.style.width).toBe("252px");
});

test("folders have their own icon, and a child sits under its folder with a guide line", async () => {
  await launch();
  await openFolder(ROOT);
  const specs = byText(".tree-row", "specs")!;
  expect(specs.hasAttribute("data-folder")).toBe(true);
  expect(specs.querySelectorAll("svg")).toHaveLength(2);
  expect(byText(".tree-row", "guide.md")!.querySelectorAll("svg")).toHaveLength(1);
  const child = byText(".tree-row", "spec.md")!;
  expect(child.closest(".tree-children")?.previousElementSibling).toBe(specs);
  expect(parseInt(child.style.paddingLeft) - parseInt(specs.style.paddingLeft)).toBe(16);
});

const rightClick = (el: Element | null | undefined) => {
  if (!el) throw new Error("Nothing to right-click");
  return act(async () => void el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 40, clientY: 40 })));
};
const menuItems = () => all(".menu button, .menu [role=separator]").map((i) => (i.getAttribute("role") === "separator" ? "-" : i.textContent));
const menuPick = (text: string) => click(byText(".menu button", text));
const inFile = (id: string) => (stored as { id: string; items: { path: string }[]; removed: string[] }[]).find((w) => w.id === id);
const removedList = () => all(".files-removed-row .tree-name").map((n) => n.textContent);
const homePins = () => all("[aria-labelledby=pinned-h] .file-name").map((n) => n.textContent);
const pins = (paths: string[]) => localStorage.setItem("pinned", JSON.stringify(paths));
const storedPins = () => localStorage.getItem("pinned");
const pinnedIn = (paths: string[]) => ({ id: "pinned", name: "Pinned", items: paths.map((path) => ({ kind: "document", path })), removed: [] });
const handPicked = (id: string, paths: string[]) => ({ ...pinnedIn(paths), id, name: id });

test("the tree's menu holds what the board shows, for a document and for a folder", async () => {
  await launch();
  await openFolder(ROOT);
  await rightClick(byText(".tree-row", "guide.md"));
  expect(menuItems()).toEqual(["Open containing folder", "Copy path", "-", "Remove from workspace"]);
  expect(host.querySelector(".menu")?.getAttribute("aria-label")).toBe("guide.md");
  await act(async () => void document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));
  expect(host.querySelector(".menu")).toBeNull();
  await rightClick(byText(".tree-row", "specs"));
  expect(host.querySelector(".menu")?.getAttribute("aria-label")).toBe("specs");
});

test("Remove from workspace hides a document in this workspace only, and Restore brings it back", async () => {
  stored = [saved("h", ROOT), { ...saved("other", ROOT), name: "Other" }];
  await launch();
  await openFolder(ROOT);
  await rightClick(byText(".tree-row", "guide.md"));
  await menuPick("Remove from workspace");
  await until(() => !rows().includes("guide.md"), "the document to go");
  expect(removedList()).toEqual(["guide.md"]);
  // The Removed list starts closed, with its count on the heading.
  expect(host.querySelector<HTMLDetailsElement>("details.files-removed")?.open).toBe(false);
  expect(host.querySelector(".files-removed summary")?.textContent).toBe("Removed1");
  expect(inFile("h")!.removed).toEqual([GUIDE]);
  expect(inFile("h")!.items).toEqual([{ kind: "folder", path: ROOT }]);
  expect(inFile("other")!.removed).toEqual([]);
  await click(host.querySelector("[aria-label='Restore guide.md']"));
  await until(() => rows().includes("guide.md"), "the document to return");
  expect(removedList()).toEqual([]);
  expect(host.querySelector(".files-removed")).toBeNull();
  await until(() => inFile("h")!.removed.length === 0, "the save");
});

test("removing a folder hides what is under it, and it stays removed after a restart", async () => {
  await launch();
  await openFolder(ROOT);
  await rightClick(byText(".tree-row", "specs"));
  await menuPick("Remove from workspace");
  await until(() => !rows().includes("spec.md"), "the folder to go");
  expect(rows()).toEqual(["Handbook", "guide.md"]);
  await until(() => saves.length === 2, "the save");
  await restart();
  await until(() => rows().includes("guide.md"), "the tree");
  expect(removedList()).toEqual(["specs"]);
});

test("removing the workspace's folder itself leaves a way back", async () => {
  await launch();
  await openFolder(ROOT);
  await rightClick(byText(".tree-row", "Handbook"));
  await menuPick("Remove from workspace");
  await until(() => !rows().length, "the tree to empty");
  expect(host.querySelector(".files-note")?.textContent).toBe("No Markdown documents in this workspace.");
  await click(host.querySelector("[aria-label='Restore Handbook']"));
  await until(() => rows().includes("guide.md"), "the tree");
});

test("a tab's menu adds its document, grouped under its project folder, with Add to workspace third", async () => {
  stored = [saved("h", ROOT)];
  localStorage.setItem("workspace", JSON.stringify("h"));
  initialFile = "C:\\repo\\docs\\deep\\draft.md";
  gitRoot = "C:\\repo";
  await launch();
  await until(() => openTabs().length, "the tab");
  await until(() => rows().includes("guide.md"), "the tree");
  await rightClick(host.querySelector(".tab"));
  expect(menuItems().slice(0, 4)).toEqual(["Open containing folder", "Copy path", "Add to workspace", "-"]);
  await menuPick("Add to workspace");
  await until(() => rows().includes("draft.md"), "the document in the tree");
  expect(rows()).toEqual(["Handbook", "specs", "spec.md", "guide.md", "repo", "docs", "deep", "draft.md"]);
  await rightClick(host.querySelector(".tab"));
  expect((byText(".menu button", "Add to workspace") as HTMLButtonElement).disabled).toBe(true);
});

test("with no workspace open a tab's menu has no Add to workspace, and with the document covered it is disabled", async () => {
  initialFile = GUIDE;
  await launch();
  await until(() => openTabs().length, "the tab");
  await rightClick(host.querySelector(".tab"));
  expect(menuItems()).not.toContain("Add to workspace");
  await act(async () => void document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));
  await clickText("Files");
  await until(() => byText("button", "Open Handbook folder"), "the offer");
  await clickText("Open Handbook folder");
  await until(() => rows().includes("guide.md"), "the tree");
  const before = saves.length;
  await rightClick(host.querySelector(".tab"));
  expect((byText(".menu button", "Add to workspace") as HTMLButtonElement).disabled).toBe(true);
  expect(saves).toHaveLength(before);
});

const addButton = () => host.querySelector<HTMLButtonElement>("[aria-label='Add to workspace']")!;
const keyOn = (el: Element, key: string) => act(async () => void el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })));

test("the + button opens a menu of Add document and Add folder, and Escape closes it with the focus back on the button", async () => {
  await launch();
  await openFolder(ROOT);
  expect(addButton().getAttribute("aria-haspopup")).toBe("menu");
  expect(addButton().getAttribute("aria-expanded")).toBe("false");
  await click(addButton());
  expect(menuItems()).toEqual(["Add document…", "Add folder…"]);
  expect(host.querySelector(".menu")?.getAttribute("aria-label")).toBe("Add to workspace");
  expect(addButton().getAttribute("aria-expanded")).toBe("true");
  await keyOn(document.activeElement!, "Escape");
  expect(host.querySelector(".menu")).toBeNull();
  expect(addButton().getAttribute("aria-expanded")).toBe("false");
  expect(document.activeElement).toBe(addButton());
  // A second click on the button closes the menu too.
  await click(addButton());
  await click(addButton());
  expect(host.querySelector(".menu")).toBeNull();
});

test("the + menu is one menu at a time with the workspace menu and a row's menu", async () => {
  await launch();
  await openFolder(ROOT);
  await click(addButton());
  await rightClick(byText(".tree-row", "guide.md"));
  expect(menuItems()).toEqual(["Open containing folder", "Copy path", "-", "Remove from workspace"]);
  await click(addButton());
  expect(menuItems()).toEqual(["Add document…", "Add folder…"]);
  await click(host.querySelector(".workspace-name"));
  expect(menuItems()).toContain("Close workspace");
  expect(menuItems()).not.toContain("Add document…");
  await click(addButton());
  expect(menuItems()).toEqual(["Add document…", "Add folder…"]);
});

test("the + menu adds another folder through the picker", async () => {
  await launch();
  await openFolder(ROOT);
  picked = NOTES;
  await click(addButton());
  await menuPick("Add folder…");
  await until(() => rows().includes("ideas.md"), "the added folder");
  expect(rows()).toEqual(["Handbook", "specs", "spec.md", "guide.md", "Notes", "ideas.md"]);
  expect(dialogs[dialogs.length - 1]).toEqual(expect.objectContaining({ directory: true }));
  await until(() => inFile(inFileId())!.items.length === 2, "the save");
  expect(document.activeElement).toBe(addButton());
});
const inFileId = () => (stored[0] as { id: string }).id;

test("the + menu adds a document through the picker; one already covered changes nothing", async () => {
  await launch();
  await openFolder(ROOT);
  const before = saves.length;
  filePicked = SPEC;
  await click(addButton());
  await menuPick("Add document…");
  await until(() => dialogs.length === 2, "the picker");
  await settle();
  expect(saves).toHaveLength(before);
  filePicked = IDEAS;
  await click(addButton());
  await menuPick("Add document…");
  await until(() => rows().includes("ideas.md"), "the added document");
  expect(inFile(inFileId())!.items.map((i) => i.path)).toEqual([ROOT, IDEAS]);
});

test("a document added by hand and gone from disk shows as not found, leaves Quick open, and Remove takes it out", async () => {
  gone = [IDEAS];
  stored = [handPicked("list", [IDEAS, SPEC])];
  localStorage.setItem("workspace", JSON.stringify("list"));
  await launch();
  await until(() => host.querySelector(".tree-missing"), "the not found row");
  expect(host.querySelector(".tree-missing")?.textContent).toBe("ideas.mdNot foundRemove");
  expect(rows()).toEqual(["Notes", "specs", "spec.md"]);
  await act(async () => void document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "p", ctrlKey: true, bubbles: true, cancelable: true })));
  await until(() => host.querySelector(".quick-row"), "Quick open");
  expect(all(".quick-row").map((r) => r.textContent)).toEqual(["spec.md"]);
  await act(async () => void document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
  await click(host.querySelector("[aria-label='Remove ideas.md']"));
  await until(() => !host.querySelector(".tree-missing"), "the row to go");
  await until(() => inFile("list")!.items.length === 1, "the save");
  expect(inFile("list")!.removed).toEqual([]);
  expect(removedList()).toEqual([]);
});

test("a saved document that comes back is found again on the next rescan", async () => {
  gone = [IDEAS];
  stored = [handPicked("list", [IDEAS])];
  localStorage.setItem("workspace", JSON.stringify("list"));
  await launch();
  await until(() => host.querySelector(".tree-missing"), "the not found row");
  gone = [];
  await focusWindow();
  await until(() => rows().includes("ideas.md"), "the document");
  expect(host.querySelector(".tree-missing")).toBeNull();
});

test("first launch moves the pins into Pinned, removes them from local storage, and a second launch changes nothing", async () => {
  pins([GUIDE, IDEAS]);
  await launch();
  await until(() => storedPins() === null, "the move");
  expect(inFile("pinned")!.items).toEqual([{ kind: "document", path: GUIDE }, { kind: "document", path: IDEAS }]);
  expect(saves).toHaveLength(1);
  expect(homePins()).toEqual(["guide.md", "ideas.md"]);
  await restart();
  await settle();
  expect(saves).toHaveLength(1);
  expect(calls).not.toContain("save_workspaces");
  expect(homePins()).toEqual(["guide.md", "ideas.md"]);
});

test("the pins stay in local storage until the save has reported success", async () => {
  pins([GUIDE]);
  let finish = () => {};
  saveGate = new Promise((done) => (finish = done));
  await launch();
  await until(() => calls.includes("save_workspaces"), "the save to start");
  await settle();
  expect(storedPins()).toBe(JSON.stringify([GUIDE]));
  await act(async () => finish());
  await until(() => storedPins() === null, "the pins to go");
});

test("with no stored pins nothing is written at launch", async () => {
  await launch();
  await settle();
  expect(calls).not.toContain("save_workspaces");
  expect(homePins()).toEqual([]);
});

test("a failed save keeps the pins where they are, working, and the next launch moves them", async () => {
  pins([GUIDE, IDEAS]);
  saveRefusal = "Disk full";
  await launch();
  await until(() => told.length, "the error");
  expect(storedPins()).toBe(JSON.stringify([GUIDE, IDEAS]));
  expect(homePins()).toEqual(["guide.md", "ideas.md"]);
  await click(host.querySelector("[aria-label='Unpin ideas.md']"));
  await until(() => homePins().length === 1, "the unpin");
  expect(storedPins()).toBe(JSON.stringify([GUIDE]));
  saveRefusal = undefined;
  await restart();
  await until(() => storedPins() === null, "the move");
  expect(inFile("pinned")!.items).toEqual([{ kind: "document", path: GUIDE }]);
});

test("a saved file that couldn't be read means no move, nothing written, and pins that keep working", async () => {
  pins([GUIDE]);
  loadRefusal = "Access is denied";
  await launch();
  await until(() => told.length, "the error");
  expect(calls).not.toContain("save_workspaces");
  expect(storedPins()).toBe(JSON.stringify([GUIDE]));
  expect(homePins()).toEqual(["guide.md"]);
  await click(host.querySelector("[aria-label='Unpin guide.md']"));
  await until(() => !homePins().length, "the unpin");
  expect(storedPins()).toBe(JSON.stringify([]));
  await restart();
  await settle();
  expect(calls).not.toContain("save_workspaces");
  loadRefusal = undefined;
  pins([IDEAS]);
  await restart();
  await until(() => storedPins() === null, "the move on the next launch");
  expect(inFile("pinned")!.items).toEqual([{ kind: "document", path: IDEAS }]);
});

test("a pin made while the saved file can't be read is kept for the next launch", async () => {
  localStorage.setItem("recent", JSON.stringify([{ path: GUIDE, at: 1 }]));
  loadRefusal = "Access is denied";
  await launch();
  await click(host.querySelector("[aria-label='Pin guide.md']"));
  await until(() => homePins().length, "the pin");
  expect(storedPins()).toBe(JSON.stringify([GUIDE]));
  expect(calls).not.toContain("save_workspaces");
  loadRefusal = undefined;
  await restart();
  await until(() => storedPins() === null, "the move");
  expect(homePins()).toEqual(["guide.md"]);
});

test("the move merges with what Pinned holds, without duplicates", async () => {
  stored = [pinnedIn([GUIDE, SPEC])];
  pins([GUIDE.toUpperCase(), IDEAS]);
  await launch();
  await until(() => storedPins() === null, "the move");
  expect(inFile("pinned")!.items.map((i) => i.path)).toEqual([GUIDE, SPEC, IDEAS]);
  expect(stored).toHaveLength(1);
});

test.each(["corrupt", "newer"])("a %s saved file isn't replaced at launch: the pins wait for the user's first change", async (reason) => {
  pins([GUIDE]);
  loadProblem = { reason, copy: `C:\\data\\workspaces.${reason}.json` };
  await launch();
  await until(() => told.length, "the message");
  await settle();
  expect(told).toHaveLength(1);
  expect(told[0].message).toContain(`workspaces.${reason}.json`);
  expect(calls).not.toContain("save_workspaces");
  expect(storedPins()).not.toBeNull();
  await openFolder(ROOT);
  await until(() => storedPins() === null, "the move");
  expect(inFile("pinned")!.items).toEqual([{ kind: "document", path: GUIDE }]);
});

test("a problem the move's save reports still counts as saved, and is told", async () => {
  pins([GUIDE]);
  saveProblem = { reason: "corrupt", copy: "C:\\data\\workspaces.corrupt.json" };
  await launch();
  await until(() => storedPins() === null, "the move");
  expect(told[0].message).toContain("workspaces.corrupt.json");
});

test("the pin button adds to and really removes from Pinned, and Home shows it", async () => {
  localStorage.setItem("recent", JSON.stringify([{ path: GUIDE, at: 1 }]));
  await launch();
  await click(host.querySelector("[aria-label='Pin guide.md']"));
  await until(() => inFile("pinned")?.items.length === 1, "the pin");
  expect(homePins()).toEqual(["guide.md"]);
  await click(host.querySelector("[aria-label='Unpin guide.md']"));
  await until(() => inFile("pinned")!.items.length === 0, "the unpin");
  expect(inFile("pinned")!.removed).toEqual([]);
  expect(homePins()).toEqual([]);
});

test("with Pinned open, the + menu adds a document to Pinned", async () => {
  stored = [pinnedIn([GUIDE])];
  await launch();
  await clickText("Open as workspace");
  await until(() => rows().includes("guide.md"), "the tree");
  filePicked = IDEAS;
  await click(addButton());
  await menuPick("Add document…");
  await until(() => rows().includes("ideas.md"), "the added document");
  expect(inFile("pinned")!.items.map((i) => i.path)).toEqual([GUIDE, IDEAS]);
  expect(stored).toHaveLength(1);
});

test("Pinned opens like any workspace, with its own tabs, and Remove from workspace unpins", async () => {
  stored = [pinnedIn([GUIDE, IDEAS])];
  await launch();
  await clickText("Open as workspace");
  await until(() => rows().includes("guide.md"), "the tree");
  expect(host.querySelector(".status-workspace")?.textContent).toBe("Pinned");
  expect(rows()).toEqual(["Handbook", "guide.md", "Notes", "ideas.md"]);
  await click(byText(".tree-row", "guide.md"));
  await until(() => localStorage.getItem("tabs:pinned")?.includes("guide.md"), "its tabs");
  await rightClick(byText(".tree-row", "ideas.md"));
  await menuPick("Remove from workspace");
  await until(() => !rows().includes("ideas.md"), "the unpin");
  expect(inFile("pinned")!.items.map((i) => i.path)).toEqual([GUIDE]);
  expect(removedList()).toEqual([]);
});

test("Pinned can't be removed and isn't listed as a recent workspace", async () => {
  stored = [saved("h", ROOT), pinnedIn([GUIDE])];
  await launch();
  expect(all("[aria-labelledby=workspaces-h] .file-name").map((n) => n.textContent)).toEqual(["Handbook"]);
  expect(host.querySelector("[aria-label='Remove workspace Pinned']")).toBeNull();
  expect(host.querySelector("[aria-label='Remove workspace Handbook']")).not.toBeNull();
});

test("removing a saved workspace asks first, says nothing on disk changes, and takes its tabs with it", async () => {
  stored = [saved("h", ROOT), saved("n", NOTES)];
  localStorage.setItem("tabs:n", JSON.stringify({ tabs: [], active: null }));
  await launch();
  await click(host.querySelector("[aria-label='Remove workspace Notes']"));
  await until(() => asked.length, "the question");
  await settle();
  expect(asked[0]).toContain("Nothing on disk changes");
  expect(stored).toHaveLength(2);
  expect(localStorage.getItem("tabs:n")).not.toBeNull();
  agree = true;
  await click(host.querySelector("[aria-label='Remove workspace Notes']"));
  await until(() => localStorage.getItem("tabs:n") === null, "its tabs to go");
  await until(() => !inFile("n"), "the save");
  expect(inFile("h")).toBeDefined();
  expect(all("[aria-labelledby=workspaces-h] .file-name").map((n) => n.textContent)).toEqual(["Handbook"]);
  expect(calls).not.toContain("delete");
});

test("removing the open workspace closes it first, and its stored tabs don't come back", async () => {
  stored = [saved("h", ROOT)];
  agree = true;
  await launch();
  await openFolder(ROOT);
  await click(byText(".tree-row", "guide.md"));
  await until(() => localStorage.getItem("tabs:h")?.includes("guide.md"), "its tabs");
  await click(host.querySelector("[aria-label=Home]"));
  await click(host.querySelector("[aria-label='Remove workspace Handbook']"));
  await until(() => !inFile("h"), "the save");
  await settle(50);
  expect(localStorage.getItem("tabs:h")).toBeNull();
  expect(host.querySelector(".status-workspace")).toBeNull();
  expect(JSON.parse(localStorage.getItem("workspace")!)).toBeNull();
  await restart();
  expect(host.querySelector(".status-workspace")).toBeNull();
  expect(localStorage.getItem("tabs:h")).toBeNull();
});
