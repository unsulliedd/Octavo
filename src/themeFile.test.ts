import { expect, test } from "vitest";
import { DEFAULT_COLORS } from "./colors";
import { isThemeError, MAX_THEME_BYTES, NEWER_THEME, NOT_A_THEME, parseTheme, themeCounts, themeFileName, themeText } from "./themeFile";

const file = (data: unknown) => JSON.stringify(data);
const theme = (text: string, name = "Solarized.octavo-theme.json") => {
  const result = parseTheme(text, name);
  if (isThemeError(result)) throw new Error(result.lead);
  return result;
};

test("an exported theme holds the version, the name and only the changed colors, pretty-printed", () => {
  const colors = { base: { primary: "#1f5fad" }, light: { "--doc": "#fdf6e3" }, dark: {} };
  const text = themeText("Solarized", colors);
  expect(text).toBe(
    '{\n  "octavoTheme": 1,\n  "name": "Solarized",\n  "base": {\n    "primary": "#1f5fad"\n  },\n  "light": {\n    "--doc": "#fdf6e3"\n  },\n  "dark": {}\n}\n',
  );
  expect(theme(text)).toEqual({ name: "Solarized", colors });
});

test("a theme with nothing changed has empty sets and imports as the defaults", () => {
  const text = themeText("My colors", DEFAULT_COLORS);
  expect(JSON.parse(text)).toEqual({ octavoTheme: 1, name: "My colors", base: {}, light: {}, dark: {} });
  expect(theme(text).colors).toEqual(DEFAULT_COLORS);
});

test("a theme from a newer Octavo is refused as such", () => {
  expect(parseTheme(file({ octavoTheme: 2, name: "Next" }), "next.json")).toEqual(NEWER_THEME);
  expect(NEWER_THEME).toEqual({ lead: "This theme is from a newer Octavo.", detail: "Update Octavo to import it." });
});

test("anything else is not a theme", () => {
  for (const text of [
    "",
    "not json",
    "[1, 2]",
    "null",
    '"text"',
    "42",
    file({ name: "No version", base: { primary: "#1f5fad" } }),
    file({ octavoTheme: 0 }),
    file({ octavoTheme: "1" }),
    file({ octavoTheme: 1.5 }),
    file({ octavoTheme: -1 }),
    file({ octavoTheme: null }),
  ]) {
    expect(parseTheme(text, "x.json"), text).toEqual(NOT_A_THEME);
  }
  expect(NOT_A_THEME.lead).toBe("This file isn't an Octavo theme.");
});

test("a file over 64 KB is refused, one at 64 KB is read", () => {
  const at = (size: number) => {
    const head = '{"octavoTheme":1,"name":"Big"}';
    return head + " ".repeat(size - head.length);
  };
  expect(theme(at(MAX_THEME_BYTES)).name).toBe("Big");
  expect(parseTheme(at(MAX_THEME_BYTES + 1), "big.json")).toEqual({ lead: "This file isn't an Octavo theme.", detail: "It's larger than 64 KB." });
  // The limit counts bytes, not characters.
  expect(isThemeError(parseTheme(at(MAX_THEME_BYTES - 100) + "ğ".repeat(60), "big.json"))).toBe(true);
});

test("unknown keys are dropped, in the file and in each set", () => {
  const text = file({
    octavoTheme: 1,
    name: "Extra",
    script: "alert(1)",
    base: { primary: "#1f5fad", tertiary: "#000000" },
    light: { "--doc": "#fdf6e3", "--not-a-role": "#123456", constructor: "#123456" },
    dark: { "--ink": "#eeeeee" },
    extra: { "--doc": "#000000" },
  }).replace('"base":{', '"base":{"__proto__":{"polluted":"#ffffff"},');
  expect(text).toContain("__proto__");
  expect(theme(text).colors).toEqual({ base: { primary: "#1f5fad" }, light: { "--doc": "#fdf6e3" }, dark: { "--ink": "#eeeeee" } });
  expect(({} as Record<string, unknown>).polluted).toBeUndefined();
});

test("bad colors are dropped; short and uppercase ones are kept as #rrggbb; defaults drop out", () => {
  const text = file({
    octavoTheme: 1,
    base: { primary: "#ABC", secondary: "blue", accent: "#d39d3f" },
    light: { "--doc": "url(x)", "--ink": "#12345", "--chrome": 12, "--line": "#DDE1E7", "--muted": "#57606a" },
    dark: "#ffffff",
  });
  expect(theme(text).colors).toEqual({ base: { primary: "#aabbcc" }, light: { "--line": "#dde1e7" }, dark: {} });
  expect(theme(file({ octavoTheme: 1, base: [], light: null })).colors).toEqual(DEFAULT_COLORS);
});

test("the name is trimmed to 80 characters and falls back to the file name", () => {
  expect(theme(file({ octavoTheme: 1, name: "  Solarized  " })).name).toBe("Solarized");
  expect(theme(file({ octavoTheme: 1, name: "x".repeat(100) })).name).toBe("x".repeat(80));
  expect(theme(file({ octavoTheme: 1, name: "🎨".repeat(81) })).name).toBe("🎨".repeat(80));
  expect(theme(file({ octavoTheme: 1 }), "Gün ışığı.octavo-theme.json").name).toBe("Gün ışığı");
  expect(theme(file({ octavoTheme: 1, name: "   " }), "Dusk.json").name).toBe("Dusk");
  expect(theme(file({ octavoTheme: 1, name: 7 }), "Dusk.JSON").name).toBe("Dusk");
  expect(theme(file({ octavoTheme: 1 }), "theme").name).toBe("theme");
});

test("a byte order mark and Windows line endings are allowed", () => {
  expect(theme(`﻿${themeText("Dusk", DEFAULT_COLORS).replace(/\n/g, "\r\n")}`).name).toBe("Dusk");
});

test("the counts name the base colors and each set", () => {
  expect(themeCounts(DEFAULT_COLORS)).toBe("0 base colors, 0 light, 0 dark");
  expect(themeCounts({ base: { primary: "#1f5fad" }, light: { "--doc": "#fdf6e3", "--ink": "#073642" }, dark: { "--doc": "#002b36" } })).toBe("1 base color, 2 light, 1 dark");
  expect(themeCounts({ base: { primary: "#000001", secondary: "#000002", accent: "#000003" }, light: {}, dark: {} })).toBe("3 base colors, 0 light, 0 dark");
});

test("the file name comes from the theme's name, without characters Windows refuses", () => {
  expect(themeFileName("My colors")).toBe("My colors.octavo-theme.json");
  expect(themeFileName('Dawn: "warm" / soft?')).toBe("Dawn warm  soft.octavo-theme.json");
  expect(themeFileName("Dusk...")).toBe("Dusk.octavo-theme.json");
  expect(themeFileName('<>:"/\\|?*')).toBe("My colors.octavo-theme.json");
});
