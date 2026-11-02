// @vitest-environment jsdom
// Quick open through the whole App: a fake disk and saved file stand behind the mocked IPC.
import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import App from "./App";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ROOT = "C:\\docs\\Handbook";
const NOTES = "C:\\docs\\Notes";
const GUIDE = `${ROOT}\\guide.md`;
const SPEC = `${ROOT}\\specs\\spec.md`;
const IDEAS = `${NOTES}\\ideas.md`;
const AUDIT = `${ROOT}\\audit\\economy.md`;

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
let told: { message: string; kind?: string }[];
let initialFile: string | null;
let gitRoot: string | undefined;

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
    [ROOT, { files: [GUIDE, SPEC, AUDIT], truncated: false }],
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
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
  Element.prototype.scrollTo = () => {};
  Element.prototype.scrollIntoView = () => Promise.resolve() as never; // the webview returns a promise
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
          return picked;
        case "plugin:dialog|message":
          told.push({ message: a.message, kind: a.kind });
          return "Ok";
        default:
          return null;
      }
    },
    { shouldMockEvents: true },
  );
  (window as any).__TAURI_INTERNALS__.convertFileSrc = (path: string) => `asset://${path}`;
});

afterEach(async () => {
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

const all = <T extends Element = HTMLElement>(selector: string) => [...host.querySelectorAll<T>(selector)];
const byText = (selector: string, text: string) => all(selector).find((el) => el.textContent?.trim() === text);
const click = (el: Element | null | undefined) => {
  if (!el) throw new Error("Nothing to click");
  return act(async () => void (el as HTMLElement).click());
};
const clickText = (text: string) => click(byText("button", text));

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


const dialog = () => document.querySelector<HTMLElement>('[role="dialog"][aria-label="Quick open"]');
const input = () => dialog()?.querySelector<HTMLInputElement>("input");
const options = () => [...(dialog()?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])];
const optionTexts = () => options().map((o) => o.textContent);
const selected = () => options().find((o) => o.getAttribute("aria-selected") === "true")?.textContent;

/** Presses `key` on the focused element (or `target`) and reports whether a handler took it over. */
function press(key: string, mods: { ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean } = {}, target: Element = document.activeElement ?? document.body) {
  const e = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...mods });
  act(() => void target.dispatchEvent(e));
  return e.defaultPrevented;
}
const quickKey = () => press("p", { ctrlKey: true });

async function type(text: string) {
  const el = input()!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, text);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

test("Ctrl+P opens a labelled search over the workspace, listing every document", async () => {
  await launch();
  await openFolder(ROOT);
  host.querySelector<HTMLElement>("button.status-workspace")!.focus();
  expect(quickKey()).toBe(true);
  await until(dialog, "quick open");
  expect(dialog()!.getAttribute("aria-modal")).toBe("true");
  expect(document.activeElement).toBe(input());
  expect(input()!.getAttribute("aria-label")).toBe("Find a document in this workspace");
  expect(input()!.getAttribute("role")).toBe("combobox");
  expect(document.querySelector('[role="listbox"]')).not.toBeNull();
  expect(optionTexts().sort()).toEqual(["audit/economy.md", "guide.md", "specs/spec.md"]);
  expect(dialog()!.textContent).toContain("In Handbook");
  expect(selected()).toBe(optionTexts()[0]);
});

test("typing filters by folder and name together, and Up, Down and Enter open a document through the normal path", async () => {
  await launch();
  await openFolder(ROOT);
  quickKey();
  await until(dialog, "quick open");
  await type("audit econ");
  expect(optionTexts()).toEqual(["audit/economy.md"]);
  expect([...dialog()!.querySelectorAll('[data-match="true"]')].map((m) => m.textContent)).toEqual(["audit", "econ"]);
  await type("md");
  expect(optionTexts()).toHaveLength(3);
  expect(selected()).toBe(optionTexts()[0]);
  press("ArrowDown");
  expect(selected()).toBe(optionTexts()[1]);
  expect(input()!.getAttribute("aria-activedescendant")).toBe(options()[1].id);
  press("ArrowDown");
  press("ArrowDown");
  expect(selected()).toBe(optionTexts()[2]);
  press("ArrowUp");
  const chosen = optionTexts()[1]!;
  expect(selected()).toBe(chosen);
  press("Enter");
  await until(() => host.querySelector("article h1"), "the document");
  expect(dialog()).toBeNull();
  expect(host.querySelector("article h1")?.textContent).toBe(chosen.split("/").pop());
});

test("a click opens a result and the box closes", async () => {
  await launch();
  await openFolder(ROOT);
  quickKey();
  await until(dialog, "quick open");
  await type("spec");
  await click(options()[0]);
  await until(() => host.querySelector("article h1")?.textContent === "spec.md", "the document");
  expect(dialog()).toBeNull();
});

test("a query with no match says so, and Enter opens nothing", async () => {
  await launch();
  await openFolder(ROOT);
  quickKey();
  await until(dialog, "quick open");
  await type("zzz");
  expect(options()).toHaveLength(0);
  expect(dialog()!.textContent).toContain("No documents match.");
  press("Enter");
  expect(dialog()).not.toBeNull();
  expect(host.querySelector("article")).toBeNull();
});

test("Escape closes the box and focus goes back where it was; Tab stays inside", async () => {
  await launch();
  await openFolder(ROOT);
  const opener = host.querySelector<HTMLElement>("button.status-workspace")!;
  opener.focus();
  quickKey();
  await until(dialog, "quick open");
  expect(press("Tab")).toBe(true);
  expect(dialog()!.contains(document.activeElement)).toBe(true);
  press("Tab", { shiftKey: true });
  expect(dialog()!.contains(document.activeElement)).toBe(true);
  expect(press("Escape")).toBe(true);
  expect(dialog()).toBeNull();
  expect(document.activeElement).toBe(opener);
});

test("the window's shortcuts wait while the box is open and work again once it is closed", async () => {
  await launch();
  await openFolder(ROOT);
  quickKey();
  await until(dialog, "quick open");
  dialogs.length = 0;
  press("o", { ctrlKey: true });
  quickKey();
  expect(dialogs).toHaveLength(0);
  expect(document.querySelectorAll('[aria-label="Quick open"]')).toHaveLength(1);
  press("Escape");
  press("o", { ctrlKey: true });
  await until(() => dialogs.length === 1, "the file picker");
});

test("quick open searches the open workspace only", async () => {
  await launch();
  await openFolder(ROOT);
  quickKey();
  await until(dialog, "quick open");
  await type("ideas");
  expect(options()).toHaveLength(0);
});

test("with no workspace open the box explains itself and Open folder… picks a folder", async () => {
  await launch();
  quickKey();
  await until(dialog, "quick open");
  expect(input()).toBeNull();
  expect(dialog()!.textContent).toContain("Open a folder to start");
  const button = [...dialog()!.querySelectorAll("button")].find((b) => b.textContent === "Open folder…")!;
  expect(document.activeElement).toBe(button);
  picked = ROOT;
  await click(button);
  expect(dialog()).toBeNull();
  await until(() => byText(".status-workspace", "Handbook"), "the workspace to open");
  expect(dialogs[0]?.directory).toBe(true);
});

test("while the first scan runs the box says so, and it fills in when the scan ends", async () => {
  hold();
  picked = ROOT;
  await launch();
  await clickText("Open folder…");
  await until(() => byText(".status-workspace", "Handbook"), "the workspace to open");
  quickKey();
  await until(dialog, "quick open");
  expect(dialog()!.textContent).toContain("Scanning…");
  await release();
  await until(() => options().length === 3, "the documents");
  expect(dialog()!.textContent).not.toContain("Scanning");
});

test("a scan that was cut off is searched as it is, with a note", async () => {
  folders.set(ROOT, { files: [GUIDE, SPEC], truncated: true });
  await launch();
  await openFolder(ROOT);
  quickKey();
  await until(dialog, "quick open");
  expect(options()).toHaveLength(2);
  expect(dialog()!.textContent).toContain("too large to scan in full");
});

test("a large workspace draws a capped list and counts the rest", async () => {
  const files = Array.from({ length: 3000 }, (_, i) => `${ROOT}\\d${i % 30}\\note${i}.md`);
  folders.set(ROOT, { files, truncated: false });
  await launch();
  await openFolder(ROOT);
  quickKey();
  await until(dialog, "quick open");
  expect(options()).toHaveLength(50);
  expect(dialog()!.textContent).toMatch(/2.950 more/);
  await type("d7 note1");
  expect(options().length).toBeLessThan(50);
  expect(dialog()!.textContent).not.toContain("more.");
});

test("Ctrl+P opens the box from Source mode and Escape goes back to the source", async () => {
  await launch();
  await openFolder(ROOT);
  await click(byText(".tree-row", "guide.md"));
  await until(() => host.querySelector("article h1"), "the document");
  await clickText("Edit");
  await until(() => byText("button", "Source"), "the editor");
  await clickText("Source");
  await until(() => host.querySelector(".cm-content"), "Source mode");
  const cm = host.querySelector<HTMLElement>(".cm-content")!;
  cm.focus();
  expect(press("p", { ctrlKey: true }, cm)).toBe(true);
  await until(dialog, "quick open");
  press("Escape");
  expect(dialog()).toBeNull();
  expect(document.activeElement).toBe(cm);
});

test("a changed shortcut opens the box and the old keys do not", async () => {
  localStorage.setItem("prefs", JSON.stringify({ shortcuts: { quickOpen: ["Ctrl+Alt+P"] } }));
  await launch();
  await openFolder(ROOT);
  quickKey();
  await settle();
  expect(dialog()).toBeNull();
  press("p", { ctrlKey: true, altKey: true });
  await until(dialog, "quick open");
});
