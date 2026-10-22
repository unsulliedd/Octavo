// Keyboard shortcuts: each action's keys by default, the keys the user changed, and which action a key press
// runs. Keys are written as "Ctrl+Shift+P"; Ctrl also stands for Cmd on macOS. Keys handled by a focused control
// (the find bar's Enter, a popover's Escape) are not listed here and can't be changed.

import type { FormatAction } from "./editor/formatInfo";

/** Actions that work anywhere in the window. */
export type AppAction =
  | "open"
  | "closeTab"
  | "nextTab"
  | "previousTab"
  | "back"
  | "forward"
  | "find"
  | "toggleFocus"
  | "toggleEdit"
  | "preview"
  | "source"
  | "save"
  | "saveAs";

/** What a key press in the window runs: an app action, or Escape leaving distraction-free mode. */
export type Action = AppAction | "exitFocus";

export type ShortcutId = AppAction | FormatAction;

/** The keys the user changed, by action; actions not listed keep their default keys. An empty list is no shortcut. */
export type Bindings = Partial<Record<ShortcutId, string[]>>;

/** Every action that can have a shortcut, in the groups and order the Shortcuts settings show them. */
export const SHORTCUT_GROUPS: { title: string; items: { id: ShortcutId; label: string; keys: string[] }[] }[] = [
  {
    title: "Files and tabs",
    items: [
      { id: "open", label: "Open file", keys: ["Ctrl+O"] },
      { id: "closeTab", label: "Close tab", keys: ["Ctrl+W"] },
      { id: "nextTab", label: "Next tab", keys: ["Ctrl+Tab", "Ctrl+PageDown"] },
      { id: "previousTab", label: "Previous tab", keys: ["Ctrl+Shift+Tab", "Ctrl+PageUp"] },
      { id: "back", label: "Back", keys: ["Alt+Left"] },
      { id: "forward", label: "Forward", keys: ["Alt+Right"] },
    ],
  },
  {
    title: "Reading",
    items: [
      { id: "find", label: "Find in document", keys: ["Ctrl+F"] },
      { id: "toggleFocus", label: "Distraction-free mode", keys: ["F11"] },
    ],
  },
  {
    title: "Editing",
    items: [
      { id: "toggleEdit", label: "Edit / Done", keys: ["Ctrl+E"] },
      { id: "preview", label: "Preview", keys: ["Ctrl+Shift+P"] },
      { id: "source", label: "Source", keys: ["Ctrl+Shift+M"] },
      { id: "save", label: "Save", keys: ["Ctrl+S"] },
      { id: "saveAs", label: "Save as…", keys: ["Ctrl+Shift+S"] },
      { id: "undo", label: "Undo", keys: ["Ctrl+Z"] },
      { id: "redo", label: "Redo", keys: ["Ctrl+Y", "Ctrl+Shift+Z"] },
    ],
  },
  {
    title: "Formatting",
    items: [
      { id: "paragraph", label: "Normal text", keys: ["Ctrl+Alt+0"] },
      { id: "h1", label: "Heading 1", keys: ["Ctrl+Alt+1"] },
      { id: "h2", label: "Heading 2", keys: ["Ctrl+Alt+2"] },
      { id: "h3", label: "Heading 3", keys: ["Ctrl+Alt+3"] },
      { id: "h4", label: "Heading 4", keys: ["Ctrl+Alt+4"] },
      { id: "h5", label: "Heading 5", keys: ["Ctrl+Alt+5"] },
      { id: "h6", label: "Heading 6", keys: ["Ctrl+Alt+6"] },
      { id: "bold", label: "Bold", keys: ["Ctrl+B"] },
      { id: "italic", label: "Italic", keys: ["Ctrl+I"] },
      { id: "strike", label: "Strikethrough", keys: ["Ctrl+Alt+X"] },
      { id: "code", label: "Inline code", keys: ["Ctrl+Shift+E"] },
      { id: "link", label: "Link", keys: ["Ctrl+K"] },
      { id: "bulletList", label: "Bulleted list", keys: ["Ctrl+Alt+8"] },
      { id: "orderedList", label: "Numbered list", keys: ["Ctrl+Alt+7"] },
      { id: "taskList", label: "Task list", keys: [] },
      { id: "quote", label: "Quote", keys: ["Ctrl+Shift+B"] },
      { id: "codeBlock", label: "Code block", keys: ["Ctrl+Alt+C"] },
    ],
  },
  {
    title: "Insert",
    items: [
      { id: "table", label: "Table", keys: [] },
      { id: "image", label: "Image", keys: [] },
      { id: "footnote", label: "Footnote", keys: [] },
      { id: "mathInline", label: "Inline math", keys: [] },
      { id: "mathBlock", label: "Math block", keys: [] },
      { id: "rule", label: "Horizontal rule", keys: [] },
      { id: "lineBreak", label: "Line break", keys: ["Shift+Enter"] },
      { id: "properties", label: "Properties", keys: [] },
    ],
  },
];

const ITEMS = SHORTCUT_GROUPS.flatMap((g) => g.items);
const ITEM = new Map(ITEMS.map((i) => [i.id, i]));

const APP_ACTIONS: AppAction[] = ["open", "closeTab", "nextTab", "previousTab", "back", "forward", "find", "toggleFocus", "toggleEdit", "preview", "source", "save", "saveAs"];
const isAppAction = (id: ShortcutId): id is AppAction => (APP_ACTIONS as string[]).includes(id);
const EDITOR_ACTIONS = ITEMS.map((i) => i.id).filter((id): id is FormatAction => !isAppAction(id));

/** Keys that keep their meaning and can't be given to an action; a shortcut on them is reported as a conflict. */
const FIXED: Record<string, string> = {
  "Ctrl+A": "Select all",
  "Ctrl+C": "Copy",
  "Ctrl+X": "Cut",
  "Ctrl+V": "Paste",
  "Ctrl+Shift+V": "Paste as plain text",
  "Ctrl+]": "Indent (lists and tables)",
  "Ctrl+[": "Outdent (lists and tables)",
  "Ctrl+Enter": "Leave the table",
  F3: "Next match",
  "Shift+F3": "Previous match",
  "Alt+F4": "Close the window",
};

export const defaultKeys = (id: ShortcutId) => ITEM.get(id)!.keys;
export const shortcutLabel = (id: ShortcutId) => ITEM.get(id)!.label;
export const keysOf = (bindings: Bindings, id: ShortcutId) => bindings[id] ?? defaultKeys(id);

/** The first keys of an action, as tooltips show them, or undefined when it has none. */
export const keyLabel = (bindings: Bindings, id: ShortcutId): string | undefined => keysOf(bindings, id)[0];

/** A tooltip with the action's keys after it: "Save (Ctrl+S)". */
export function withKeys(label: string, bindings: Bindings, id: ShortcutId) {
  const keys = keyLabel(bindings, id);
  return keys ? `${label} (${keys})` : label;
}

type Key = Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey"> & { code?: string };

const MODIFIER_KEYS = new Set(["Control", "Shift", "Alt", "AltGraph", "Meta", "OS", "CapsLock", "NumLock", "Dead", "Unidentified", "Process"]);
const KEY_NAMES: Record<string, string> = { " ": "Space", "+": "Plus", ArrowLeft: "Left", ArrowRight: "Right", ArrowUp: "Up", ArrowDown: "Down", Esc: "Escape", Del: "Delete" };

/** The keys of a key press as "Ctrl+Alt+Shift+Key", or undefined while only modifier keys are down. */
export function comboOf(e: Key): string | undefined {
  if (MODIFIER_KEYS.has(e.key)) return undefined;
  const ctrl = e.ctrlKey || e.metaKey;
  let key = KEY_NAMES[e.key] ?? e.key;
  if (key.length === 1) {
    // The number row gives "!" or "&" with Shift or on some layouts; its place says which digit it is.
    const digit = /^Digit(\d)$/.exec(e.code ?? "")?.[1];
    // On a non-Latin layout Ctrl+S types a letter of that layout; the key's place says it is S. Ctrl+Alt is
    // AltGr on many layouts, where the typed character is meant.
    const letter = ctrl && !e.altKey && !/^[\x21-\x7e]$/.test(key) ? /^Key([A-Z])$/.exec(e.code ?? "")?.[1] : undefined;
    key = digit ?? letter ?? key.toUpperCase();
  }
  return [ctrl && "Ctrl", e.altKey && "Alt", e.shiftKey && "Shift", key].filter(Boolean).join("+");
}

/** Whether keys can be a shortcut: with Ctrl or Alt, a function key, or Shift+Enter. Plain keys are for typing. */
export function isAssignable(combo: string) {
  const parts = combo.split("+");
  const key = parts[parts.length - 1];
  if (!key || MODIFIER_KEYS.has(key)) return false;
  if (parts.includes("Ctrl") || parts.includes("Alt")) return true;
  return /^F\d{1,2}$/.test(key) || combo === "Shift+Enter";
}

/** The action of a key press in the window, outside the editor's own keys. */
export function shortcut(e: Key, bindings: Bindings, state: { focusMode: boolean; findOpen: boolean; settingsOpen: boolean }): Action | undefined {
  const combo = comboOf(e);
  if (!combo) return undefined;
  // Escape closes the innermost thing first.
  if (combo === "Escape") return state.focusMode && !state.findOpen && !state.settingsOpen ? "exitFocus" : undefined;
  return APP_ACTIONS.find((id) => keysOf(bindings, id).includes(combo));
}

/** The formatting action of a key press in the editor. */
export function editorShortcut(e: Key, bindings: Bindings): FormatAction | undefined {
  const combo = comboOf(e);
  return combo ? EDITOR_ACTIONS.find((id) => keysOf(bindings, id).includes(combo)) : undefined;
}

/** `bindings` with `id` on `keys`; keys equal to the defaults remove the change. */
export function setKeys(bindings: Bindings, id: ShortcutId, keys: string[]): Bindings {
  const { [id]: _, ...rest } = bindings;
  const same = keys.length === defaultKeys(id).length && keys.every((k, i) => k === defaultKeys(id)[i]);
  return same ? rest : { ...rest, [id]: keys };
}

/** For each action whose keys something else also uses, what else uses them. */
export function conflicts(bindings: Bindings): Partial<Record<ShortcutId, string[]>> {
  const users = new Map<string, ShortcutId[]>();
  for (const { id } of ITEMS) for (const combo of keysOf(bindings, id)) users.set(combo, [...(users.get(combo) ?? []), id]);
  const result: Partial<Record<ShortcutId, string[]>> = {};
  for (const { id } of ITEMS) {
    const others = keysOf(bindings, id).flatMap((combo) => [
      ...(users.get(combo) ?? []).filter((other) => other !== id).map(shortcutLabel),
      ...(FIXED[combo] ? [FIXED[combo]] : []),
    ]);
    if (others.length) result[id] = [...new Set(others)];
  }
  return result;
}

/** Bindings read from storage: unknown actions and keys that can't be shortcuts are dropped. */
export function sanitizeBindings(stored: unknown): Bindings {
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return {};
  const result: Bindings = {};
  for (const [id, keys] of Object.entries(stored)) {
    if (!ITEM.has(id as ShortcutId) || !Array.isArray(keys)) continue;
    result[id as ShortcutId] = keys.filter((k): k is string => typeof k === "string" && isAssignable(k));
  }
  return result;
}
