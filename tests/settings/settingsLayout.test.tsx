// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Settings } from "@/settings/Settings";
import { DEFAULT_PREFS, type Prefs } from "@/settings/storage";
import type { UpdateStatus } from "@/updates/updates";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn(), save: vi.fn() }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));
vi.mock("@/settings/colors", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/settings/colors")>()), readColor: () => "#336699" }));

let host: HTMLElement;
let root: Root;
let prefs: Prefs;
let update: UpdateStatus;
let narrow: boolean;
let closed: number;
let checked: number;

function render() {
  act(() =>
    root.render(
      <Settings
        prefs={prefs}
        dark={false}
        onChange={(next) => {
          prefs = next;
          render();
        }}
        onClose={() => closed++}
        version="1.2.3"
        update={update}
        onCheckUpdate={() => checked++}
        onRestart={() => {}}
        onWhatsNew={() => {}}
        onLicenses={() => {}}
      />,
    ),
  );
}

beforeEach(() => {
  prefs = DEFAULT_PREFS;
  update = { state: "idle" };
  narrow = false;
  closed = checked = 0;
  vi.stubGlobal("matchMedia", (media: string) => ({ matches: narrow, media, addEventListener() {}, removeEventListener() {} }));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  render();
});

afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

const tabs = () => [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
const selected = () => tabs().find((t) => t.getAttribute("aria-selected") === "true")!;
const key = (el: Element, k: string) => act(() => void el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true })));
const byLabel = (label: string) => host.querySelector<HTMLElement>(`[aria-label="${label}"]`)!;
const button = (text: string) => [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === text);
const keysOf = (action: string) => host.querySelector<HTMLButtonElement>(`button.shortcut-keys[aria-label^="${action}:"]`)!;
const rowOf = (action: string) => keysOf(action).closest("li")!;
const find = () => host.querySelector<HTMLInputElement>("#shortcut-find")!;
function type(el: HTMLInputElement, text: string) {
  act(() => {
    el.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, text);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
function openShortcuts() {
  act(() => tabs().find((t) => t.textContent === "Shortcuts")!.click());
}
/** Starts recording an action's keys and presses `k` with Ctrl or other keys held. */
function press(action: string, k: string, mods: KeyboardEventInit = {}) {
  const keys = keysOf(action);
  act(() => {
    keys.focus();
    keys.click();
  });
  act(() => void keysOf(action).dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...mods })));
}

test("the sections are a vertical tablist with one tab in the tab order, and the body is its panel", () => {
  const list = host.querySelector('[role="tablist"]')!;
  expect(list.getAttribute("aria-orientation")).toBe("vertical");
  expect(tabs().map((t) => t.textContent)).toEqual(["Reading", "Colors", "Editing", "Saving", "Shortcuts", "About"]);
  expect(tabs().map((t) => t.tabIndex)).toEqual([0, -1, -1, -1, -1, -1]);
  expect(tabs().every((t) => t.querySelector("svg"))).toBe(true);
  const panel = host.querySelector('[role="tabpanel"]')!;
  expect(panel.getAttribute("aria-labelledby")).toBe(selected().id);
  expect(tabs().every((t) => t.getAttribute("aria-controls") === panel.id)).toBe(true);
});

test("Up and Down move between sections and wrap, Home and End go to the ends, and the focus follows", () => {
  act(() => tabs()[0].focus());
  key(tabs()[0], "ArrowDown");
  expect(selected().textContent).toBe("Colors");
  expect(document.activeElement).toBe(selected());
  expect(tabs().map((t) => t.tabIndex)).toEqual([-1, 0, -1, -1, -1, -1]);
  expect(host.querySelector(".settings-title")!.textContent).toBe("Colors");
  key(selected(), "End");
  expect(selected().textContent).toBe("About");
  key(selected(), "ArrowDown");
  expect(selected().textContent).toBe("Reading");
  key(selected(), "ArrowUp");
  expect(selected().textContent).toBe("About");
  key(selected(), "Home");
  expect(selected().textContent).toBe("Reading");
  expect(document.activeElement).toBe(tabs()[0]);
  key(selected(), "Escape");
  expect(closed).toBe(1);
});

test("the list's foot shows the version, the update status and Check for updates", () => {
  const foot = host.querySelector(".settings-nav-foot")!;
  expect(foot.querySelector("span")!.textContent).toBe("Octavo 1.2.3");
  expect(foot.querySelector(".setting-hint")!.textContent).toBe("");
  act(() => button("Check for updates")!.click());
  expect(checked).toBe(1);
  update = { state: "current" };
  render();
  expect(foot.querySelector(".setting-hint")!.textContent).toBe("Octavo is up to date.");
  update = { state: "checking", manual: true };
  render();
  expect(button("Check for updates")!.disabled).toBe(true);
  update = { state: "ready", version: "1.3.0" };
  render();
  expect(foot.querySelector(".setting-hint")!.textContent).toBe("Octavo 1.3.0 is ready. Restart to install it.");
  expect(foot.querySelector("button")!.textContent).toBe("Restart now");
});

test("tabs name their section in a tooltip only while the list is a rail", () => {
  expect(tabs().every((t) => t.dataset.tip === undefined)).toBe(true);
  act(() => root.unmount());
  narrow = true;
  root = createRoot(host);
  render();
  expect(tabs().map((t) => t.dataset.tip)).toEqual(["Reading", "Colors", "Editing", "Saving", "Shortcuts", "About"]);
});

test("Shortcuts: keys show as one cap per key, a second shortcut after or, and an action without keys as None", () => {
  openShortcuts();
  expect([...keysOf("Next tab").querySelectorAll("kbd")].map((k) => k.textContent)).toEqual(["Ctrl", "Tab", "Ctrl", "PageDown"]);
  expect(keysOf("Next tab").querySelector(".shortcut-or")!.textContent).toBe("or");
  expect(keysOf("Next tab").getAttribute("aria-label")).toBe("Next tab: Ctrl+Tab or Ctrl+PageDown. Click to change");
  expect(keysOf("Table").textContent).toBe("None");
  expect(host.querySelector('[aria-labelledby="shortcuts-Keys that don\'t change"]')).not.toBeNull();
  expect([...host.querySelectorAll(".shortcut-group h3")].pop()!.textContent).toBe("Keys that don't change");
  expect(host.querySelector(".shortcut-keys.fixed")!.tagName).toBe("SPAN");
});

test("Find a shortcut narrows the list by name or keys, counts the matches and hides empty groups", () => {
  openShortcuts();
  expect(host.querySelector('label[for="shortcut-find"]')!.textContent).toBe("Find a shortcut");
  expect(host.querySelector("#shortcut-count")!.textContent).toBe("");
  type(find(), "ctrl+k");
  expect([...host.querySelectorAll(".shortcut-group h3")].map((h) => h.textContent)).toEqual(["Formatting"]);
  expect(host.querySelectorAll(".key-row").length).toBe(1);
  expect(host.querySelector("#shortcut-count")!.textContent).toBe("1 shortcut");
  expect([...keysOf("Link").querySelectorAll("kbd[data-hit]")].map((k) => k.textContent)).toEqual(["Ctrl", "K"]);
  type(find(), "heading");
  expect(host.querySelector("#shortcut-count")!.textContent).toBe("6 shortcuts");
  expect(rowOf("Heading 1").querySelector("mark")!.textContent).toBe("Heading");
  type(find(), "zzz");
  expect(host.querySelector("#shortcut-count")!.textContent).toBe("No shortcut matches");
  expect(host.querySelectorAll(".shortcut-group").length).toBe(0);
  act(() => byLabel("Clear").click());
  expect(find().value).toBe("");
  expect(document.activeElement).toBe(find());
});

test("with text in Find a shortcut, the first Escape clears it and the second closes Settings", () => {
  openShortcuts();
  type(find(), "tab");
  key(find(), "Escape");
  expect(find().value).toBe("");
  expect(closed).toBe(0);
  key(find(), "Escape");
  expect(closed).toBe(1);
});

test("a conflict is marked on both rows, and Remove from … takes the keys off the other action", () => {
  openShortcuts();
  press("Table", "k", { ctrlKey: true });
  expect(prefs.shortcuts).toEqual({ table: ["Ctrl+K"] });
  expect(rowOf("Table").hasAttribute("data-conflict")).toBe(true);
  expect(rowOf("Link").hasAttribute("data-conflict")).toBe(true);
  expect(rowOf("Table").querySelector(".shortcut-note")!.textContent).toBe("Link also uses Ctrl+K.Remove from Link");
  expect(rowOf("Link").querySelector(".shortcut-note")!.textContent).toBe("Table also uses Ctrl+K.Remove from Table");
  expect(keysOf("Table").getAttribute("aria-describedby")).toBe("shortcut-note-table");
  act(() => button("Remove from Link")!.click());
  expect(prefs.shortcuts).toEqual({ table: ["Ctrl+K"], link: [] });
  expect(host.querySelector("[data-conflict]")).toBeNull();
  expect(keysOf("Link").textContent).toBe("None");
});

test("keys that keep their meaning are refused while recording, with the reason, and recording goes on", () => {
  openShortcuts();
  press("Bold", "c", { ctrlKey: true });
  expect(prefs.shortcuts).toEqual({});
  expect(keysOf("Bold").hasAttribute("data-recording")).toBe(true);
  expect(rowOf("Bold").querySelector('[role="alert"]')!.textContent).toBe("Ctrl+C copies and can't be changed.");
  act(() => void keysOf("Bold").dispatchEvent(new KeyboardEvent("keydown", { key: "b", ctrlKey: true, altKey: true, bubbles: true })));
  expect(prefs.shortcuts).toEqual({ bold: ["Ctrl+Alt+B"] });
  expect(rowOf("Bold").hasAttribute("data-changed")).toBe(true);
});

test("recording shows Press keys… with its note; Escape cancels without closing and Backspace removes the shortcut", () => {
  openShortcuts();
  act(() => keysOf("Save").click());
  expect(keysOf("Save").textContent).toBe("Press keys…");
  expect(rowOf("Save").querySelector(".shortcut-note")!.textContent).toBe("Press the new keys, such as Ctrl+Shift+R. Escape cancels; Backspace removes the shortcut.");
  key(keysOf("Save"), "Escape");
  expect(closed).toBe(0);
  expect(keysOf("Save").hasAttribute("data-recording")).toBe(false);
  press("Save", "Backspace");
  expect(prefs.shortcuts).toEqual({ save: [] });
  expect(keysOf("Save").textContent).toBe("None");
  expect(byLabel("Reset Save").hidden).toBe(false);
  expect(byLabel("Reset Save").dataset.tip).toBe("Reset to Ctrl+S");
});

test("Reset group shows only for a changed group and resets just that group", () => {
  openShortcuts();
  expect(button("Reset group")).toBeUndefined();
  prefs = { ...prefs, shortcuts: { find: ["Ctrl+Alt+F"], toggleFocus: [], save: ["Ctrl+L"] } };
  render();
  expect([...host.querySelectorAll<HTMLButtonElement>("button")].filter((b) => b.textContent === "Reset group").map((b) => b.getAttribute("aria-label"))).toEqual([
    "Reset Reading shortcuts",
    "Reset Editing shortcuts",
  ]);
  act(() => byLabel("Reset Reading shortcuts").click());
  expect(prefs.shortcuts).toEqual({ save: ["Ctrl+L"] });
  expect(byLabel("Reset Reading shortcuts")).toBeNull();
  act(() => button("Reset all")!.click());
  expect(prefs.shortcuts).toEqual({});
});
