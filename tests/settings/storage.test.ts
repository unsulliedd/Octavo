// @vitest-environment jsdom
import { expect, test } from "vitest";
import { DEFAULT_PREFS, forget, lineWidth, loadPinned, loadPrefs, openLarge, outlineAt, recentFiles, save } from "@/settings/storage";

test("a stored line width is kept; anything else is the default width", () => {
  expect(lineWidth("wider")).toBe("wider");
  expect(lineWidth("narrow")).toBe("narrow");
  expect(lineWidth("widest")).toBe("default");
  expect(lineWidth(undefined)).toBe("default");
  expect(lineWidth(3)).toBe("default");
});

test("a stored way of opening diagrams and images large is kept; anything else is both", () => {
  expect(openLarge("button")).toBe("button");
  expect(openLarge("click")).toBe("click");
  expect(openLarge("both")).toBe("both");
  expect(openLarge("hover")).toBe("both");
  expect(openLarge(undefined)).toBe("both");
});

test("recent files keep only entries with a path and a time", () => {
  const file = { path: "C:/notes/a.md", at: 1 };
  expect(recentFiles([file, "C:/notes/b.md", { path: "C:/notes/c.md" }, null, 4])).toEqual([file]);
  expect(recentFiles("junk")).toEqual([]);
  expect(recentFiles(undefined)).toEqual([]);
});

test("hidden folders are left out of workspaces by default", () => {
  expect(DEFAULT_PREFS.showHidden).toBe(false);
});

test("the outline is shown in the sidebar by default, and the sidebar is shown", () => {
  expect(DEFAULT_PREFS).toMatchObject({ outline: true, showOutline: true, outlineAt: "sidebar" });
});

test("a preference stored before the outline had a place keeps the sidebar as it was, with the outline in it", () => {
  localStorage.clear();
  save("prefs", { theme: "dark", outline: false, sidebarWidth: 300 });
  expect(loadPrefs()).toMatchObject({ theme: "dark", outline: false, showOutline: true, outlineAt: "sidebar", sidebarWidth: 300 });
  save("prefs", { outline: true });
  expect(loadPrefs()).toMatchObject({ outline: true, showOutline: true, outlineAt: "sidebar" });
});

test("a stored outline place is kept, and anything else is the sidebar", () => {
  expect(outlineAt("right")).toBe("right");
  expect(outlineAt("left")).toBe("left");
  expect(outlineAt("sidebar")).toBe("sidebar");
  expect(outlineAt("top")).toBe("sidebar");
  expect(outlineAt(undefined)).toBe("sidebar");
  localStorage.clear();
  save("prefs", { showOutline: false, outlineAt: "middle" });
  expect(loadPrefs()).toMatchObject({ showOutline: false, outlineAt: "sidebar" });
});

test("stored colors keep the valid changed ones, and junk is no colors changed", () => {
  localStorage.clear();
  expect(loadPrefs().colors).toEqual({ base: {}, light: {}, dark: {} });
  save("prefs", { colors: { base: { primary: "#1F5FAD", accent: "nope", other: "#000000" } } });
  expect(loadPrefs().colors).toEqual({ base: { primary: "#1f5fad" }, light: {}, dark: {} });
  save("prefs", { colors: "#000000" });
  expect(loadPrefs().colors).toEqual({ base: {}, light: {}, dark: {} });
});

test("stored pins are read as paths, undefined when there are none to move", () => {
  localStorage.clear();
  expect(loadPinned()).toBeUndefined();
  save("pinned", ["C:/a.md", 3, null, "C:/b.md"]);
  expect(loadPinned()).toEqual(["C:/a.md", "C:/b.md"]);
  save("pinned", { a: 1 });
  expect(loadPinned()).toEqual([]);
  forget("pinned");
  expect(localStorage.getItem("pinned")).toBeNull();
  expect(loadPinned()).toBeUndefined();
});
