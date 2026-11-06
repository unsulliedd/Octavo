// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Settings } from "./Settings";
import { DEFAULT_PREFS, type Prefs } from "./storage";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));

let host: HTMLElement;
let root: Root;
let prefs: Prefs;
let changes: Prefs[];

function render() {
  act(() =>
    root.render(
      <Settings
        prefs={prefs}
        onChange={(next) => {
          changes.push(next);
          prefs = next;
          render();
        }}
        onClose={() => {}}
        version="0.0.0"
        update={{ state: "idle" }}
        onCheckUpdate={() => {}}
        onRestart={() => {}}
        onWhatsNew={() => {}}
        onLicenses={() => {}}
      />,
    ),
  );
}

beforeEach(() => {
  prefs = DEFAULT_PREFS;
  changes = [];
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  render();
  act(() => [...host.querySelectorAll<HTMLButtonElement>(".settings-nav button")].find((b) => b.textContent === "Colors")!.click());
});

afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
});

const byLabel = (label: string) => host.querySelector<HTMLElement>(`[aria-label="${label}"]`)!;
const field = (name: string) => host.querySelector<HTMLInputElement>(`#color-${name}`)!;
const resetAll = () => [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === "Reset all colors")!;
const error = () => host.querySelector(".color-error");
function type(el: HTMLInputElement, text: string) {
  act(() => {
    el.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, text);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const enter = (el: HTMLElement) => act(() => void el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
const blur = (el: HTMLElement) => act(() => el.blur());

test("Colors comes after Reading, with the theme, the three base colors and nothing to reset", () => {
  expect([...host.querySelectorAll(".settings-nav button")].map((b) => b.textContent).slice(0, 3)).toEqual(["Reading", "Colors", "Editing"]);
  expect(host.querySelector(".settings-title")!.textContent).toBe("Colors");
  expect([...byLabel("Theme").querySelectorAll("button")].map((b) => b.textContent)).toEqual(["Light", "Dark", "System"]);
  expect([...host.querySelectorAll(".color-row label")].map((l) => l.textContent)).toEqual(["Primary", "Secondary", "Accent"]);
  expect(field("primary").value).toBe("#5a0e27");
  expect(byLabel("Choose Primary color").dataset.tip).toBe("#5a0e27");
  expect(byLabel("Reset Primary").dataset.tip).toBe("Reset to #5a0e27");
  for (const name of ["Primary", "Secondary", "Accent"]) expect(byLabel(`Reset ${name}`).hidden).toBe(true);
  expect(resetAll().disabled).toBe(true);
  expect(host.querySelector(".color-preview")!.hasAttribute("inert")).toBe(true);
});

test("the theme can be picked here too", () => {
  act(() => [...byLabel("Theme").querySelectorAll("button")].find((b) => b.textContent === "Dark")!.click());
  expect(prefs.theme).toBe("dark");
});

test("a typed color applies on Enter, lowercased, and shows its Reset and Reset all", () => {
  type(field("primary"), "#1F5FAD");
  expect(changes).toEqual([]);
  enter(field("primary"));
  expect(prefs.colors).toEqual({ base: { primary: "#1f5fad" } });
  expect(field("primary").value).toBe("#1f5fad");
  expect(byLabel("Choose Primary color").dataset.tip).toBe("#1f5fad");
  expect(byLabel("Reset Primary").hidden).toBe(false);
  expect(byLabel("Reset Secondary").hidden).toBe(true);
  expect(resetAll().disabled).toBe(false);
  act(() => byLabel("Reset Primary").click());
  expect(prefs.colors).toEqual({ base: {} });
  expect(field("primary").value).toBe("#5a0e27");
  expect(byLabel("Reset Primary").hidden).toBe(true);
});

test("a short color applies widened when the field is left", () => {
  type(field("secondary"), "#abc");
  blur(field("secondary"));
  expect(prefs.colors).toEqual({ base: { secondary: "#aabbcc" } });
  expect(field("secondary").value).toBe("#aabbcc");
});

test("a bad value shows its error when the field is left or Enter is pressed, not while typing, and changes nothing", () => {
  type(field("accent"), "#d39d3");
  expect(error()).toBeNull();
  expect(field("accent").hasAttribute("aria-invalid")).toBe(false);
  blur(field("accent"));
  expect(error()!.textContent).toBe("Enter # and six hex digits, such as #d39d3f. Accent stays as it was.");
  expect(field("accent").getAttribute("aria-invalid")).toBe("true");
  expect(field("accent").getAttribute("aria-describedby")).toBe("color-accent-error color-accent-help");
  expect(field("accent").value).toBe("#d39d3");
  expect(changes).toEqual([]);
  type(field("accent"), "#d39d3x");
  expect(error()).toBeNull();
  enter(field("accent"));
  expect(error()).not.toBeNull();
  expect(changes).toEqual([]);
  type(field("accent"), "#00aa00");
  enter(field("accent"));
  expect(error()).toBeNull();
  expect(prefs.colors).toEqual({ base: { accent: "#00aa00" } });
});

test("typing the default color back keeps nothing changed", () => {
  type(field("primary"), "#1f5fad");
  enter(field("primary"));
  type(field("primary"), "#5A0E27");
  enter(field("primary"));
  expect(prefs.colors).toEqual({ base: {} });
  expect(resetAll().disabled).toBe(true);
});

test("a color chosen in the picker applies at once", () => {
  const picker = byLabel("Choose Accent color").parentElement!.querySelector<HTMLInputElement>('input[type="color"]')!;
  type(picker, "#123456");
  expect(prefs.colors).toEqual({ base: { accent: "#123456" } });
  expect(field("accent").value).toBe("#123456");
});

test("Reset all colors puts every base color back", () => {
  type(field("primary"), "#1f5fad");
  enter(field("primary"));
  type(field("accent"), "#00aa00");
  enter(field("accent"));
  act(() => resetAll().click());
  expect(prefs.colors).toEqual({ base: {} });
  expect(resetAll().disabled).toBe(true);
  for (const name of ["Primary", "Secondary", "Accent"]) expect(byLabel(`Reset ${name}`).hidden).toBe(true);
});
