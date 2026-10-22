import { expect, test } from "vitest";
import { comboOf, conflicts, editorShortcut, isAssignable, keyLabel, sanitizeBindings, setKeys, shortcut, withKeys } from "./shortcuts";

const idle = { focusMode: false, findOpen: false, settingsOpen: false };
type Mods = Partial<Record<"ctrlKey" | "metaKey" | "shiftKey" | "altKey", boolean>> & { code?: string };
const key = (k: string, mods: Mods = {}) => ({ key: k, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods });

test("key presses read as combos", () => {
  expect(comboOf(key("s", { ctrlKey: true }))).toBe("Ctrl+S");
  expect(comboOf(key("S", { ctrlKey: true }))).toBe("Ctrl+S"); // Caps Lock
  expect(comboOf(key("P", { metaKey: true, shiftKey: true }))).toBe("Ctrl+Shift+P");
  expect(comboOf(key("ArrowLeft", { altKey: true }))).toBe("Alt+Left");
  expect(comboOf(key("!", { ctrlKey: true, shiftKey: true, code: "Digit1" }))).toBe("Ctrl+Shift+1");
  expect(comboOf(key("&", { ctrlKey: true, altKey: true, code: "Digit1" }))).toBe("Ctrl+Alt+1"); // AZERTY
  expect(comboOf(key("ы", { ctrlKey: true, code: "KeyS" }))).toBe("Ctrl+S"); // Russian layout
  expect(comboOf(key("ź", { ctrlKey: true, altKey: true, code: "KeyX" }))).toBe("Ctrl+Alt+Ź"); // AltGr types a letter
  expect(comboOf(key(" ", { ctrlKey: true }))).toBe("Ctrl+Space");
  expect(comboOf(key("Enter", { shiftKey: true }))).toBe("Shift+Enter");
  expect(comboOf(key("Control", { ctrlKey: true }))).toBeUndefined();
  expect(comboOf(key("Shift", { shiftKey: true }))).toBeUndefined();
});

test("only keys that don't type text can be shortcuts", () => {
  expect(isAssignable("Ctrl+P")).toBe(true);
  expect(isAssignable("Alt+Left")).toBe(true);
  expect(isAssignable("F11")).toBe(true);
  expect(isAssignable("Shift+F5")).toBe(true);
  expect(isAssignable("Shift+Enter")).toBe(true);
  expect(isAssignable("P")).toBe(false);
  expect(isAssignable("Shift+P")).toBe(false);
  expect(isAssignable("Enter")).toBe(false);
  expect(isAssignable("Tab")).toBe(false);
});

test("window shortcuts with the default keys", () => {
  expect(shortcut(key("o", { ctrlKey: true }), {}, idle)).toBe("open");
  expect(shortcut(key("O", { ctrlKey: true }), {}, idle)).toBe("open");
  expect(shortcut(key("f", { ctrlKey: true }), {}, idle)).toBe("find");
  expect(shortcut(key("F", { ctrlKey: true, shiftKey: true }), {}, idle)).toBeUndefined();
  expect(shortcut(key("w", { metaKey: true }), {}, idle)).toBe("closeTab");
  expect(shortcut(key("e", { ctrlKey: true }), {}, idle)).toBe("toggleEdit");
  expect(shortcut(key("P", { ctrlKey: true, shiftKey: true }), {}, idle)).toBe("preview");
  expect(shortcut(key("M", { ctrlKey: true, shiftKey: true }), {}, idle)).toBe("source");
  expect(shortcut(key("E", { ctrlKey: true, shiftKey: true }), {}, idle)).toBeUndefined(); // the editor's inline code
  expect(shortcut(key("s", { ctrlKey: true }), {}, idle)).toBe("save");
  expect(shortcut(key("S", { ctrlKey: true, shiftKey: true }), {}, idle)).toBe("saveAs");
  expect(shortcut(key("Tab", { ctrlKey: true }), {}, idle)).toBe("nextTab");
  expect(shortcut(key("Tab", { ctrlKey: true, shiftKey: true }), {}, idle)).toBe("previousTab");
  expect(shortcut(key("PageDown", { ctrlKey: true }), {}, idle)).toBe("nextTab");
  expect(shortcut(key("PageUp", { ctrlKey: true }), {}, idle)).toBe("previousTab");
  expect(shortcut(key("ArrowLeft", { altKey: true }), {}, idle)).toBe("back");
  expect(shortcut(key("ArrowRight", { altKey: true }), {}, idle)).toBe("forward");
  expect(shortcut(key("F11"), {}, idle)).toBe("toggleFocus");
  expect(shortcut(key("f"), {}, idle)).toBeUndefined();
  expect(shortcut(key("o", { ctrlKey: true, altKey: true }), {}, idle)).toBeUndefined(); // AltGr on some layouts
  expect(shortcut(key("b", { ctrlKey: true }), {}, idle)).toBeUndefined(); // the editor's bold
});

test("changed keys replace the defaults", () => {
  const bindings = { preview: ["Ctrl+P"], save: [] };
  expect(shortcut(key("p", { ctrlKey: true }), bindings, idle)).toBe("preview");
  expect(shortcut(key("P", { ctrlKey: true, shiftKey: true }), bindings, idle)).toBeUndefined();
  expect(shortcut(key("s", { ctrlKey: true }), bindings, idle)).toBeUndefined();
});

test("Escape leaves distraction-free mode only when nothing else is open", () => {
  expect(shortcut(key("Escape"), {}, idle)).toBeUndefined();
  expect(shortcut(key("Escape"), {}, { ...idle, focusMode: true })).toBe("exitFocus");
  expect(shortcut(key("Escape"), {}, { ...idle, focusMode: true, findOpen: true })).toBeUndefined();
  expect(shortcut(key("Escape"), {}, { ...idle, focusMode: true, settingsOpen: true })).toBeUndefined();
});

test("editor shortcuts", () => {
  expect(editorShortcut(key("b", { ctrlKey: true }), {})).toBe("bold");
  expect(editorShortcut(key("E", { ctrlKey: true, shiftKey: true }), {})).toBe("code");
  expect(editorShortcut(key("4", { ctrlKey: true, altKey: true, code: "Digit4" }), {})).toBe("h4");
  expect(editorShortcut(key("0", { ctrlKey: true, altKey: true, code: "Digit0" }), {})).toBe("paragraph");
  expect(editorShortcut(key("Z", { ctrlKey: true, shiftKey: true }), {})).toBe("redo");
  expect(editorShortcut(key("Enter", { shiftKey: true }), {})).toBe("lineBreak");
  expect(editorShortcut(key("k", { ctrlKey: true }), {})).toBe("link");
  expect(editorShortcut(key("s", { ctrlKey: true }), {})).toBeUndefined(); // the window's Save
  expect(editorShortcut(key("t", { ctrlKey: true, altKey: true }), { table: ["Ctrl+Alt+T"] })).toBe("table");
  expect(editorShortcut(key("b", { ctrlKey: true }), { bold: [] })).toBeUndefined();
});

test("tooltips show the current keys", () => {
  expect(keyLabel({}, "save")).toBe("Ctrl+S");
  expect(keyLabel({}, "nextTab")).toBe("Ctrl+Tab");
  expect(keyLabel({}, "taskList")).toBeUndefined();
  expect(withKeys("Preview", { preview: ["Ctrl+P"] }, "preview")).toBe("Preview (Ctrl+P)");
  expect(withKeys("Save", { save: [] }, "save")).toBe("Save");
});

test("keys equal to the defaults drop the change", () => {
  expect(setKeys({}, "preview", ["Ctrl+P"])).toEqual({ preview: ["Ctrl+P"] });
  expect(setKeys({ preview: ["Ctrl+P"] }, "preview", ["Ctrl+Shift+P"])).toEqual({});
  expect(setKeys({ preview: ["Ctrl+P"] }, "redo", ["Ctrl+Y", "Ctrl+Shift+Z"])).toEqual({ preview: ["Ctrl+P"] });
  expect(setKeys({}, "save", [])).toEqual({ save: [] });
});

test("conflicts name everything else on the same keys", () => {
  expect(conflicts({})).toEqual({});
  expect(conflicts({ code: ["Ctrl+B"] })).toEqual({ bold: ["Inline code"], code: ["Bold"] });
  expect(conflicts({ preview: ["Ctrl+S"], bold: ["Ctrl+S"] })).toEqual({ save: ["Preview", "Bold"], preview: ["Save", "Bold"], bold: ["Preview", "Save"] });
  expect(conflicts({ bold: ["Ctrl+C"] })).toEqual({ bold: ["Copy"] });
  expect(conflicts({ save: [] })).toEqual({});
});

test("stored bindings are checked", () => {
  expect(sanitizeBindings(null)).toEqual({});
  expect(sanitizeBindings([])).toEqual({});
  expect(sanitizeBindings({ save: ["Ctrl+Alt+S", "S", 4], nope: ["Ctrl+Q"], open: "Ctrl+O", bold: [] })).toEqual({ save: ["Ctrl+Alt+S"], bold: [] });
});
