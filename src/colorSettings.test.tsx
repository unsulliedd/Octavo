// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { DEFAULT_COLORS, ROLE } from "./colors";
import { Settings } from "./Settings";
import { DEFAULT_PREFS, type Prefs } from "./storage";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));
// jsdom draws nothing: a role reads as the color set on its sample, else its fixed default, else a stand-in per theme.
vi.mock("./colors", async (importOriginal) => {
  const colors = await importOriginal<typeof import("./colors")>();
  return {
    ...colors,
    readColor: (el: HTMLElement) => {
      const scope = el.closest<HTMLElement>(".color-scope")!;
      const set = scope.dataset.theme as "light" | "dark";
      const key = el.dataset.role!;
      return scope.style.getPropertyValue(key) || colors.ROLE[key][set] || (set === "dark" ? "#88aacc" : "#336699");
    },
  };
});

let host: HTMLElement;
let root: Root;
let prefs: Prefs;
let changes: Prefs[];
let dark: boolean;

function render() {
  act(() =>
    root.render(
      <Settings
        prefs={prefs}
        dark={dark}
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
  dark = false;
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
  expect([...host.querySelector('[aria-labelledby="base-colors"]')!.querySelectorAll(".color-row label")].map((l) => l.textContent)).toEqual(["Primary", "Secondary", "Accent"]);
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
  expect(prefs.colors).toEqual({ ...DEFAULT_COLORS, base: { primary: "#1f5fad" } });
  expect(field("primary").value).toBe("#1f5fad");
  expect(byLabel("Choose Primary color").dataset.tip).toBe("#1f5fad");
  expect(byLabel("Reset Primary").hidden).toBe(false);
  expect(byLabel("Reset Secondary").hidden).toBe(true);
  expect(resetAll().disabled).toBe(false);
  act(() => byLabel("Reset Primary").click());
  expect(prefs.colors).toEqual(DEFAULT_COLORS);
  expect(field("primary").value).toBe("#5a0e27");
  expect(byLabel("Reset Primary").hidden).toBe(true);
});

test("a short color applies widened when the field is left", () => {
  type(field("secondary"), "#abc");
  blur(field("secondary"));
  expect(prefs.colors).toEqual({ ...DEFAULT_COLORS, base: { secondary: "#aabbcc" } });
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
  expect(prefs.colors).toEqual({ ...DEFAULT_COLORS, base: { accent: "#00aa00" } });
});

test("typing the default color back keeps nothing changed", () => {
  type(field("primary"), "#1f5fad");
  enter(field("primary"));
  type(field("primary"), "#5A0E27");
  enter(field("primary"));
  expect(prefs.colors).toEqual(DEFAULT_COLORS);
  expect(resetAll().disabled).toBe(true);
});

test("a color chosen in the picker applies at once", () => {
  const picker = byLabel("Choose Accent color").parentElement!.querySelector<HTMLInputElement>('input[type="color"]')!;
  type(picker, "#123456");
  expect(prefs.colors).toEqual({ ...DEFAULT_COLORS, base: { accent: "#123456" } });
  expect(field("accent").value).toBe("#123456");
});

test("Reset all colors puts every base color back", () => {
  type(field("primary"), "#1f5fad");
  enter(field("primary"));
  type(field("accent"), "#00aa00");
  enter(field("accent"));
  act(() => resetAll().click());
  expect(prefs.colors).toEqual(DEFAULT_COLORS);
  expect(resetAll().disabled).toBe(true);
  for (const name of ["Primary", "Secondary", "Accent"]) expect(byLabel(`Reset ${name}`).hidden).toBe(true);
});

const role = (key: string) => host.querySelector<HTMLInputElement>(`#role${key}`)!;
const radio = (name: string) => [...host.querySelectorAll<HTMLInputElement>('[role="radiogroup"] input')].find((i) => i.parentElement!.textContent === name)!;
const group = (name: string) => host.querySelector<HTMLElement>(`[aria-labelledby="${[...host.querySelectorAll("h3")].find((h) => h.textContent === name)!.id}"]`)!;
const resetGroup = (name: string) => host.querySelector<HTMLButtonElement>(`[aria-label="Reset ${name} colors"]`);
function setRole(key: string, hex: string) {
  type(role(key), hex);
  enter(role(key));
}

test("every role is listed in its group, with its tag or help where it has one", () => {
  expect([...host.querySelectorAll(".color-group h3")].map((h) => h.textContent)).toEqual([
    "Window",
    "Document",
    "Links and focus",
    "Selection and find",
    "Controls",
    "Warnings",
    "Code blocks",
    "Inline code",
    "Tooltips and scrollbars",
  ]);
  expect(host.querySelectorAll(".color-group .color-row")).toHaveLength(40);
  expect([...group("Window").querySelectorAll("label")].map((l) => l.textContent)).toEqual(["Sidebar background", "Hover background", "Lines", "Field borders", "Text", "Muted text"]);
  expect(byLabel("Choose Page background color").dataset.tip).toBe("#ffffff");
  expect(role("--doc").getAttribute("aria-describedby")).toBe("role--doc-help");
  expect(host.querySelector("#role--doc-help")!.textContent).toBe("Behind the document, Home and these settings.");
  expect(host.querySelector("#role--line-help")).toBeNull();
  expect(host.querySelector("#role--link-tag")!.textContent).toBe("From secondary");
  expect(host.querySelector("#role--line-strong-tag")!.textContent).toBe("From Muted text");
  expect(host.querySelector("#role--control-ink-tag")!.textContent).toBe("Automatic");
  expect(role("--control-ink").getAttribute("aria-describedby")).toBe("role--control-ink-tag role--control-ink-help");
  expect(host.querySelector("#role--doc-tag")).toBeNull();
  for (const name of ["Page background", "Link", "Button text"]) expect(byLabel(`Reset ${name}`).hidden).toBe(true);
  for (const g of ["Window", "Links and focus"]) expect(resetGroup(g)).toBeNull();
});

test("a role that follows another color shows the color it has now, then drops its tag once changed", () => {
  expect(role("--link").value).toBe("#336699");
  setRole("--link", "#1f4e79");
  expect(prefs.colors).toEqual({ ...DEFAULT_COLORS, light: { "--link": "#1f4e79" } });
  expect(host.querySelector("#role--link-tag")).toBeNull();
  expect(byLabel("Reset Link").hidden).toBe(false);
  expect(byLabel("Reset Link").dataset.tip).toBe("Reset to follow secondary");
  expect(byLabel("Reset Focus ring").dataset.tip).toBe("Reset to follow Link");
  expect(byLabel("Reset Current find match text").dataset.tip).toBe("Reset to automatic");
  expect(byLabel("Reset Page background").dataset.tip).toBe("Reset to #ffffff");
  act(() => byLabel("Reset Link").click());
  expect(prefs.colors).toEqual(DEFAULT_COLORS);
  expect(host.querySelector("#role--link-tag")!.textContent).toBe("From secondary");
});

test("Colors for starts on the theme that shows and picks the set the rows change", () => {
  expect(radio("Light").checked).toBe(true);
  expect(host.querySelector("#color-set-hint")!.textContent).toBe("Dark keeps its own colors.");
  expect(host.querySelector(".color-preview")!.getAttribute("data-theme")).toBe("light");
  setRole("--doc", "#fffdf8");
  act(() => radio("Dark").click());
  expect(radio("Dark").checked).toBe(true);
  expect(host.querySelector("#color-set-hint")!.textContent).toBe("Light keeps its own colors.");
  expect(role("--doc").value).toBe("#131518");
  expect(byLabel("Reset Page background").hidden).toBe(true);
  expect(byLabel("Reset Page background").dataset.tip).toBe("Reset to #131518");
  setRole("--doc", "#101418");
  expect(prefs.colors).toEqual({ base: {}, light: { "--doc": "#fffdf8" }, dark: { "--doc": "#101418" } });
  act(() => radio("Light").click());
  expect(role("--doc").value).toBe("#fffdf8");
});

test("with the dark theme showing, Colors for starts on Dark", () => {
  dark = true;
  render();
  expect(radio("Dark").checked).toBe(true);
  setRole("--chrome", "#000000");
  expect(prefs.colors.dark).toEqual({ "--chrome": "#000000" });
});

test("the preview and the code samples draw the set being edited", () => {
  prefs = { ...prefs, colors: { base: { accent: "#00aa00" }, light: { "--doc": "#fffdf8" }, dark: { "--doc": "#101418", "--code-kw": "#ff0000" } } };
  render();
  const preview = host.querySelector<HTMLElement>(".color-preview")!;
  const sample = host.querySelector<HTMLElement>(".color-code-sample")!;
  expect(preview.style.getPropertyValue("--doc")).toBe("#fffdf8");
  expect(preview.style.getPropertyValue("--brand-accent")).toBe("#00aa00");
  act(() => radio("Dark").click());
  for (const scope of [preview, sample, host.querySelector<HTMLElement>(".color-inline-sample")!]) {
    expect(scope.dataset.theme).toBe("dark");
    expect(scope.style.getPropertyValue("--doc")).toBe("#101418");
  }
  expect(sample.style.getPropertyValue("--code-kw")).toBe("#ff0000");
});

test("Reset group shows once a role in the group is changed in the set being edited, and resets that group only", () => {
  setRole("--chrome", "#f4f1ea");
  setRole("--ink", "#000000");
  setRole("--link", "#1f4e79");
  expect(resetGroup("Window")!.textContent).toBe("Reset group");
  expect(resetGroup("Document")).toBeNull();
  act(() => radio("Dark").click());
  expect(resetGroup("Window")).toBeNull();
  act(() => radio("Light").click());
  act(() => resetGroup("Window")!.click());
  expect(prefs.colors).toEqual({ ...DEFAULT_COLORS, light: { "--link": "#1f4e79" } });
  expect(resetGroup("Window")).toBeNull();
  expect(resetGroup("Links and focus")).not.toBeNull();
});

test("Reset all colors resets the base colors and both sets", () => {
  prefs = { ...prefs, colors: { base: {}, light: {}, dark: { "--doc": "#101418" } } };
  render();
  expect(resetAll().disabled).toBe(false);
  setRole("--doc", "#fffdf8");
  type(field("primary"), "#1f5fad");
  enter(field("primary"));
  act(() => resetAll().click());
  expect(prefs.colors).toEqual(DEFAULT_COLORS);
  expect(resetAll().disabled).toBe(true);
});

test("a changed color hard to read on its background warns under its row, and the warning goes once it reads well", () => {
  setRole("--link", "#6fa8d6");
  expect(host.querySelector("#role--link-warning")!.textContent).toBe("Hard to read on Sidebar background (2.3:1)");
  expect(role("--link").getAttribute("aria-describedby")).toBe("role--link-warning");
  expect(prefs.colors.light).toEqual({ "--link": "#6fa8d6" });
  setRole("--link", "#1f4e79");
  expect(host.querySelector("#role--link-warning")).toBeNull();
});

test("a changed background that untouched text is hard to read on warns on the background's row", () => {
  setRole("--doc", "#202020");
  expect(host.querySelector("#role--doc-warning")!.textContent).toBe("Text is hard to read on this (1.0:1)");
  expect(host.querySelector("#role--ink-warning")).toBeNull();
  act(() => byLabel("Reset Page background").click());
  expect(host.querySelector("#role--doc-warning")).toBeNull();
});

test("Jump to lists the groups and moves to the one picked", () => {
  const jump = [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === "Jump to")!;
  expect(jump.getAttribute("aria-haspopup")).toBe("menu");
  act(() => jump.click());
  const items = [...host.querySelectorAll<HTMLButtonElement>('[role="menu"] button')];
  expect(items.map((b) => b.textContent)).toEqual(["Window", "Document", "Links and focus", "Selection and find", "Controls", "Warnings", "Code blocks", "Inline code", "Tooltips and scrollbars"]);
  const scrolled = vi.fn();
  Element.prototype.scrollIntoView = scrolled;
  act(() => items[6].click());
  expect(host.querySelector('[role="menu"]')).toBeNull();
  expect(scrolled.mock.contexts[0]).toBe(group("Code blocks"));
  expect(document.activeElement).toBe(role("--code-bg"));
  expect(ROLE["--code-bg"].group).toBe("code");
});
