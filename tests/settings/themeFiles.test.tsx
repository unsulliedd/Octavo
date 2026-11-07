// @vitest-environment jsdom
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { DEFAULT_COLORS, type Colors } from "@/settings/colors";
import { ask, promptText } from "@/ui/dialog";
import { Settings } from "@/settings/Settings";
import { DEFAULT_PREFS, type Prefs } from "@/settings/storage";
import { themeText } from "@/settings/themeFile";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn(), save: vi.fn() }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));
vi.mock("@/ui/dialog", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/ui/dialog")>()), ask: vi.fn(), promptText: vi.fn() }));
// jsdom draws nothing: every role reads as one stand-in color.
vi.mock("@/settings/colors", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/settings/colors")>()), readColor: () => "#336699" }));

const invoked = vi.mocked(invoke);
const opened = vi.mocked(open);
const saved = vi.mocked(save);
const asked = vi.mocked(ask);
const prompted = vi.mocked(promptText);

let host: HTMLElement;
let root: Root;
let prefs: Prefs;
let changes: Prefs[];

function render() {
  act(() =>
    root.render(
      <Settings
        prefs={prefs}
        dark={false}
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

const button = (text: string) => [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === text)!;
const section = (name: string) => act(() => [...host.querySelectorAll<HTMLButtonElement>(".settings-nav button")].find((b) => b.textContent === name)!.click());
const notice = () => host.querySelector<HTMLElement>(".color-notice");
/** Clicks the button and waits for the dialogs and commands it awaits, which the mocks settle at once. */
async function click(text: string) {
  await act(async () => {
    button(text).click();
    await new Promise((done) => setTimeout(done));
  });
}

const CHANGED: Colors = { base: { primary: "#1f5fad" }, light: { "--doc": "#fffdf8" }, dark: {} };
const SOLARIZED: Colors = {
  base: { primary: "#1f5fad", secondary: "#2aa198", accent: "#b58900" },
  light: { "--doc": "#fdf6e3", "--ink": "#073642" },
  dark: { "--doc": "#002b36" },
};

function start(colors: Colors) {
  prefs = { ...DEFAULT_PREFS, colors };
  changes = [];
  render();
  section("Colors");
}

beforeEach(() => {
  vi.stubGlobal("matchMedia", (media: string) => ({ matches: false, media, addEventListener() {}, removeEventListener() {} }));
  vi.resetAllMocks();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
});

test("Export theme… and Import theme… sit beside Reset all colors by the heading", () => {
  start(DEFAULT_COLORS);
  expect([...host.querySelectorAll(".settings-title-actions button")].map((b) => b.textContent)).toEqual(["Export theme…", "Import theme…", "Reset all colors"]);
  expect(button("Export theme…").disabled).toBe(false);
});

test("export asks for a name, then a file named after it, and writes the changed colors there", async () => {
  start(CHANGED);
  prompted.mockResolvedValue("Dawn");
  saved.mockResolvedValue("C:\\Themes\\Dawn.octavo-theme.json");
  await click("Export theme…");
  expect(prompted).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ title: "Export theme", value: "My colors" }));
  expect(saved).toHaveBeenCalledWith({ defaultPath: "Dawn.octavo-theme.json", filters: [{ name: "Octavo theme", extensions: ["json"] }] });
  expect(invoked).toHaveBeenCalledWith("write_theme", { path: "C:\\Themes\\Dawn.octavo-theme.json", text: themeText("Dawn", CHANGED) });
  expect(changes).toEqual([]);
  expect(notice()).toBeNull();
});

test("export works with nothing changed", async () => {
  start(DEFAULT_COLORS);
  prompted.mockResolvedValue("My colors");
  saved.mockResolvedValue("C:\\My colors.octavo-theme.json");
  await click("Export theme…");
  expect(JSON.parse((invoked.mock.calls[0][1] as { text: string }).text)).toEqual({ octavoTheme: 1, name: "My colors", base: {}, light: {}, dark: {} });
});

test("cancelling the name or the file exports nothing", async () => {
  start(CHANGED);
  prompted.mockResolvedValue(undefined);
  await click("Export theme…");
  expect(saved).not.toHaveBeenCalled();
  prompted.mockResolvedValue("Dawn");
  saved.mockResolvedValue(null);
  await click("Export theme…");
  expect(invoked).not.toHaveBeenCalled();
  expect(changes).toEqual([]);
  expect(notice()).toBeNull();
});

test("a failed write shows why in the error notice", async () => {
  start(CHANGED);
  prompted.mockResolvedValue("Dawn");
  saved.mockResolvedValue("C:\\Windows\\Dawn.octavo-theme.json");
  invoked.mockRejectedValue("Octavo isn't allowed to save in this folder.");
  await click("Export theme…");
  expect(notice()!.getAttribute("role")).toBe("alert");
  expect(notice()!.textContent).toBe("The theme couldn't be saved. Octavo isn't allowed to save in this folder.");
});

test("import reads the picked .json file, asks, and on Replace colors takes the theme's colors exactly", async () => {
  start(CHANGED);
  opened.mockResolvedValue("C:\\Themes\\solar.octavo-theme.json");
  invoked.mockResolvedValue(themeText("Solarized", SOLARIZED));
  asked.mockResolvedValue(true);
  await click("Import theme…");
  expect(opened).toHaveBeenCalledWith({ filters: [{ name: "Octavo theme", extensions: ["json"] }] });
  expect(invoked).toHaveBeenCalledWith("read_theme", { path: "C:\\Themes\\solar.octavo-theme.json" });
  expect(asked).toHaveBeenCalledWith(
    "Your base colors and the Light and Dark sets become the theme's. To keep the colors you have now, export them first.",
    { title: "Replace your colors with Solarized?", okLabel: "Replace colors" },
  );
  expect(prefs.colors).toEqual(SOLARIZED);
  expect(notice()!.getAttribute("role")).toBe("status");
  expect(notice()!.textContent).toBe("Imported Solarized: 3 base colors, 2 light, 1 dark.");
  expect(host.querySelector<HTMLInputElement>("#color-secondary")!.value).toBe("#2aa198");
});

test("Cancel in the confirm changes nothing", async () => {
  start(CHANGED);
  opened.mockResolvedValue("C:\\solar.json");
  invoked.mockResolvedValue(themeText("Solarized", SOLARIZED));
  asked.mockResolvedValue(false);
  await click("Import theme…");
  expect(asked).toHaveBeenCalled();
  expect(changes).toEqual([]);
  expect(notice()).toBeNull();
});

test("with no color changed there is nothing to lose, so import doesn't ask", async () => {
  start(DEFAULT_COLORS);
  opened.mockResolvedValue("C:\\solar.json");
  invoked.mockResolvedValue(themeText("Solarized", SOLARIZED));
  await click("Import theme…");
  expect(asked).not.toHaveBeenCalled();
  expect(prefs.colors).toEqual(SOLARIZED);
});

test("cancelling the file reads nothing", async () => {
  start(CHANGED);
  opened.mockResolvedValue(null);
  await click("Import theme…");
  expect(invoked).not.toHaveBeenCalled();
  expect(changes).toEqual([]);
  expect(notice()).toBeNull();
});

test("a file that isn't a theme, or is from a newer Octavo, shows the error notice and changes nothing", async () => {
  start(CHANGED);
  opened.mockResolvedValue("C:\\notes.json");
  invoked.mockResolvedValue('{"name": "Notes"}');
  await click("Import theme…");
  expect(notice()!.getAttribute("role")).toBe("alert");
  expect(notice()!.classList.contains("bad")).toBe(true);
  expect(notice()!.textContent).toBe("This file isn't an Octavo theme. Your colors didn't change.");
  invoked.mockResolvedValue('{"octavoTheme": 2}');
  await click("Import theme…");
  expect(notice()!.textContent).toBe("This theme is from a newer Octavo. Update Octavo to import it. Your colors didn't change.");
  expect(asked).not.toHaveBeenCalled();
  expect(changes).toEqual([]);
});

test("a file that can't be read shows why", async () => {
  start(CHANGED);
  opened.mockResolvedValue("C:\\big.json");
  invoked.mockRejectedValue("It's larger than 64 KB, so it isn't an Octavo theme.");
  await click("Import theme…");
  expect(notice()!.textContent).toBe("The theme couldn't be opened. It's larger than 64 KB, so it isn't an Octavo theme. Your colors didn't change.");
  expect(changes).toEqual([]);
});

test("the notice closes with Dismiss and goes away when the section is left", async () => {
  start(DEFAULT_COLORS);
  opened.mockResolvedValue("C:\\solar.json");
  invoked.mockResolvedValue(themeText("Solarized", SOLARIZED));
  await click("Import theme…");
  act(() => host.querySelector<HTMLButtonElement>('.color-notice [aria-label="Dismiss"]')!.click());
  expect(notice()).toBeNull();
  asked.mockResolvedValue(true);
  await click("Import theme…");
  expect(notice()).not.toBeNull();
  section("Reading");
  section("Colors");
  expect(notice()).toBeNull();
});
