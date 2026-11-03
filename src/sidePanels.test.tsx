// @vitest-environment jsdom
// The side panels through the whole App: the option, the toolbar buttons, the dashes and the floating panel.
import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import App from "./App";
import { OPEN_DELAY } from "./EdgeRail";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ROOT = "C:\\docs\\Handbook";
const GUIDE = `${ROOT}\\guide.md`;
const SPEC = `${ROOT}\\specs\\spec.md`;
const TEXT = "# Guide\n\n## Setup\n\n### Details\n\n## Usage\n";

let host: HTMLElement;
let root: Root;
let initialFile: string | null;
let withWorkspace: boolean;

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
  initialFile = GUIDE;
  withWorkspace = true;
  window.innerWidth = 1280;
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
  Element.prototype.scrollTo = () => {};
  scrolled.length = 0;
  Element.prototype.scrollIntoView = function (this: Element) {
    scrolled.push(this.id);
  };
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
        case "open_doc":
          return { path: a.path, text: TEXT };
        case "load_workspaces":
          return { workspaces: withWorkspace ? [{ id: "w1", name: "Handbook", items: [{ kind: "folder", path: ROOT }], removed: [] }] : [], problem: null };
        case "save_workspaces":
          return null;
        case "workspace_folder":
          return a.dir;
        case "missing_documents":
          return [];
        case "scan_folder":
          return { files: [GUIDE, SPEC], truncated: false };
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
  vi.useRealTimers();
});

async function launch(prefs: object = {}) {
  localStorage.setItem("prefs", JSON.stringify(prefs));
  if (withWorkspace) localStorage.setItem("workspace", JSON.stringify("w1"));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<App />));
  await until(() => !initialFile || host.querySelector("article h1"), "the document");
  if (withWorkspace && left()) await until(() => host.querySelector(".tree-row"), "the tree");
}

const one = <T extends Element = HTMLElement>(selector: string) => host.querySelector<T>(selector);
const left = () => one(".sidebar:not([data-floating])");
const floating = () => one(".sidebar[data-floating]");
const rail = () => one(".edge-rail");
const place = () => one(".edge-place");
const key = () => one<HTMLButtonElement>(".edge-key");
const scrolled: string[] = [];
const click = (el: Element | null | undefined) => {
  if (!el) throw new Error("Nothing to click");
  return act(async () => void (el as HTMLElement).click());
};
const button = (label: string) => one<HTMLButtonElement>(`.toolbar [aria-label="${label}"]`);
const tabs = () => [...(left()?.querySelectorAll(".seg button") ?? [])].map((b) => b.textContent);
const stored = () => JSON.parse(localStorage.getItem("prefs") ?? "{}");
const hover = async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  await act(async () => void rail()!.querySelector(".dash-row")!.dispatchEvent(new MouseEvent("pointerover", { bubbles: true })));
  await act(async () => void vi.advanceTimersByTime(OPEN_DELAY));
};
const toggles = () => [...host.querySelectorAll("label.setting-toggle")];

test("a fresh install looks as before: the sidebar has the Files and Outline tabs, with nothing else", async () => {
  await launch();
  expect(tabs()).toEqual(["Files", "Outline"]);
  expect(left()?.querySelector(".tree")).not.toBeNull();
  expect(button("Show sidebar")?.getAttribute("aria-pressed")).toBe("true");
  expect(one(".edge-place")).toBeNull();
  expect(button("Show outline")).toBeNull();
  expect(floating()).toBeNull();
});

test("an old preference keeps its meaning: the sidebar is shown or hidden as it was, with the outline in it", async () => {
  await launch({ outline: false, theme: "light", size: 16 });
  expect(left()).toBeNull();
  expect(button("Show sidebar")?.getAttribute("aria-pressed")).toBe("false");
  expect(rail()).toBeNull();
  await click(button("Reading settings"));
  expect(toggles().find((l) => l.textContent === "Show outline")!.querySelector("input")!.checked).toBe(true);
  await click(button("Show sidebar"));
  expect(tabs()).toEqual(["Files", "Outline"]);
  expect(stored().outline).toBe(true);
  expect(stored().showOutline).toBe(true);
  expect(stored().outlineAt).toBe("sidebar");
});

test("with the outline in the sidebar, hiding the sidebar hides the outline too", async () => {
  await launch({ outline: false });
  expect(left()).toBeNull();
  expect(rail()).toBeNull();
  expect(one(".sidebar")).toBeNull();
});

test("with no workspace open the sidebar holds the Outline tab, as before", async () => {
  withWorkspace = false;
  await launch();
  expect(tabs()).toEqual(["Files", "Outline"]);
  expect(left()?.querySelector(".outline")).not.toBeNull();
});

test("Show outline off leaves Files alone and no outline anywhere, whatever the location", async () => {
  for (const outlineAt of ["sidebar", "right", "left"]) {
    await launch({ showOutline: false, outlineAt });
    expect(tabs()).toEqual([]);
    expect(left()?.querySelector(".tree")).not.toBeNull();
    expect(left()?.querySelector(".outline")).toBeNull();
    expect(rail()).toBeNull();
    await act(async () => root.unmount());
    host.remove();
    localStorage.clear();
  }
});

test("the location is only offered while Show outline is on, and picking one is saved", async () => {
  await launch({ showOutline: false });
  await click(button("Reading settings"));
  expect(one('[role=group][aria-label="Outline location"]')).toBeNull();
  await click(toggles().find((l) => l.textContent === "Show outline")!.querySelector("input"));
  expect(stored().showOutline).toBe(true);
  const group = one('[role=group][aria-label="Outline location"]')!;
  expect([...group.querySelectorAll("button")].map((b) => [b.textContent, b.getAttribute("aria-pressed")])).toEqual([
    ["In sidebar", "true"],
    ["Right", "false"],
    ["Left", "false"],
  ]);
  await click(group.querySelectorAll("button")[1]);
  expect(stored().outlineAt).toBe("right");
  expect(tabs()).toEqual([]);
  expect(one(".edge-place[data-side=right]")).not.toBeNull();
});

test("Right: Files is alone in the sidebar, and the outline's dashes are headings, shorter for lower levels, the current one brighter", async () => {
  await launch({ outlineAt: "right" });
  expect(tabs()).toEqual([]);
  expect(left()?.querySelector(".tree")).not.toBeNull();
  const dashes = [...rail()!.querySelectorAll<HTMLElement>(".dash")];
  expect(dashes.map((d) => d.style.width)).toEqual(["13px", "10px", "7px", "10px"]);
  expect(dashes.map((d) => d.dataset.active)).toEqual(["true", undefined, undefined, undefined]);
  expect(place()!.dataset.side).toBe("right");
  expect(rail()!.getAttribute("aria-hidden")).toBe("true");
  expect(key()!.getAttribute("aria-label")).toBe("Show outline panel");
  expect(button("Show outline")).toBeNull();
});

test("Left: the dashes are on the left, and hovering floats the outline from there", async () => {
  await launch({ outlineAt: "left" });
  expect(place()!.dataset.side).toBe("left");
  await hover();
  expect(floating()?.dataset.floating).toBe("left");
  expect([...floating()!.querySelectorAll(".outline a")].map((a) => a.textContent)).toEqual(["Guide", "Setup", "Details", "Usage"]);
});

test("the floating outline is as wide as the sidebar is set to be", async () => {
  await launch({ outlineAt: "right", sidebarWidth: 300 });
  await hover();
  expect((floating() as HTMLElement).style.width).toBe("300px");
});

test("Right: hovering floats the outline from the right", async () => {
  await launch({ outlineAt: "right" });
  await hover();
  expect(floating()?.dataset.floating).toBe("right");
  expect(left()).not.toBeNull();
});

test("the dashes stay when the sidebar is hidden, and the sidebar button does not touch the outline", async () => {
  await launch({ outlineAt: "right", outline: false });
  expect(left()).toBeNull();
  expect(rail()).not.toBeNull();
  await click(button("Show sidebar"));
  expect(left()).not.toBeNull();
  expect(rail()).not.toBeNull();
  expect(stored().outline).toBe(true);
});

test("in the hover modes with no workspace open and the sidebar shown, the sidebar shows the offer", async () => {
  withWorkspace = false;
  await launch({ outlineAt: "right" });
  expect(tabs()).toEqual([]);
  expect(left()?.textContent).toContain("No workspace open");
});

test("with no document open there are no dashes", async () => {
  initialFile = null;
  await launch({ outlineAt: "right" });
  expect(rail()).toBeNull();
  expect(left()).not.toBeNull();
});

test("a click on a dash scrolls to its heading as the outline's link does, and opens nothing", async () => {
  await launch({ outlineAt: "right" });
  await click(rail()!.querySelectorAll(".dash-row")[2]);
  expect(scrolled.at(-1)).toBe("details");
  expect(floating()).toBeNull();
});

test("a link in the outline in the sidebar scrolls to its heading", async () => {
  await launch();
  await click(left()!.querySelector(".outline") ? null : [...left()!.querySelectorAll(".seg button")].find((b) => b.textContent === "Outline"));
  await click(left()!.querySelectorAll(".outline a")[1]);
  expect(scrolled.at(-1)).toBe("setup");
});

test("the keyboard route: the button opens the outline with focus on the current heading, and Escape returns", async () => {
  await launch({ outlineAt: "left" });
  key()!.focus();
  await click(key());
  expect(floating()?.dataset.floating).toBe("left");
  expect(document.activeElement?.textContent).toBe("Guide");
  expect(document.activeElement?.closest(".outline")).not.toBeNull();
  await act(async () => void document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
  expect(floating()).toBeNull();
  expect(document.activeElement).toBe(key());
});

test("the shortcut shows and hides the sidebar, and Bold's key does not", async () => {
  await launch();
  const press = (init: KeyboardEventInit) => act(async () => void window.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init })));
  await press({ key: "\\", ctrlKey: true });
  expect(left()).toBeNull();
  expect(stored().outline).toBe(false);
  await press({ key: "b", ctrlKey: true });
  expect(left()).toBeNull();
  await press({ key: "\\", ctrlKey: true });
  expect(left()).not.toBeNull();
});

test("the Files tree puts a folder's contents one level in from the folder, and documents line up with folders", async () => {
  await launch();
  const pad = (row: Element) => parseFloat((row as HTMLElement).style.paddingLeft);
  const rows = [...host.querySelectorAll(".tree-row")];
  const folder = rows.find((r) => r.textContent === "Handbook")!;
  const child = rows.find((r) => r.textContent === "guide.md")!;
  const deeper = rows.find((r) => r.textContent === "spec.md")!;
  expect(pad(child)).toBe(pad(folder) + 16);
  expect(pad(deeper)).toBe(pad(child) + 16);
  expect(child.querySelector(".tree-slot")).not.toBeNull();
  expect(folder.querySelector(".tree-slot")).toBeNull();
});

test("distraction-free mode has no dashes", async () => {
  await launch({ outlineAt: "right" });
  expect(rail()).not.toBeNull();
  await click(button("Reading settings"));
  await click(toggles().find((l) => l.textContent?.startsWith("Distraction-free"))!.querySelector("input"));
  expect(rail()).toBeNull();
});
