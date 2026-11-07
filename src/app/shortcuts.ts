// Keyboard shortcuts: each action's keys by default, the keys the user changed, and which action a key press
// runs. Keys are written as "Ctrl+Shift+P"; Ctrl also stands for Cmd on macOS. Keys handled by a focused control
// (the find bar's Enter, a popover's Escape) are not listed here and can't be changed.

import type { FormatAction } from "@/editor/formatInfo";

/** Actions that work anywhere in the window. */
export type AppAction =
  | "open"
  | "quickOpen"
  | "toggleFiles"
  | "closeTab"
  | "reopenTab"
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
      { id: "quickOpen", label: "Quick open", keys: ["Ctrl+P"] },
      { id: "toggleFiles", label: "Show or hide Files", keys: ["Ctrl+\\"] },
      { id: "closeTab", label: "Close tab", keys: ["Ctrl+W"] },
      { id: "reopenTab", label: "Reopen closed tab", keys: ["Ctrl+Shift+T"] },
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

const APP_ACTIONS: AppAction[] = ["open", "quickOpen", "toggleFiles", "closeTab", "reopenTab", "nextTab", "previousTab", "back", "forward", "find", "toggleFocus", "toggleEdit", "preview", "source", "save", "saveAs"];
const isAppAction = (id: ShortcutId): id is AppAction => (APP_ACTIONS as string[]).includes(id);
const EDITOR_ACTIONS = ITEMS.map((i) => i.id).filter((id): id is FormatAction => !isAppAction(id));

/**
 * Keys that keep their meaning and can't be given to an action, with what they do as a row's name and in a sentence.
 * Recording one is refused; a stored shortcut on one is reported as a conflict.
 */
export const FIXED: { keys: string; label: string; does: string }[] = [
  { keys: "Ctrl+A", label: "Select all", does: "selects all" },
  { keys: "Ctrl+C", label: "Copy", does: "copies" },
  { keys: "Ctrl+X", label: "Cut", does: "cuts" },
  { keys: "Ctrl+V", label: "Paste", does: "pastes" },
  { keys: "Ctrl+Shift+V", label: "Paste as plain text", does: "pastes as plain text" },
  { keys: "Ctrl+]", label: "Indent (lists and tables)", does: "indents lists and tables" },
  { keys: "Ctrl+[", label: "Outdent (lists and tables)", does: "outdents lists and tables" },
  { keys: "Ctrl+Enter", label: "Leave the table", does: "leaves the table" },
  { keys: "F3", label: "Next match", does: "goes to the next match" },
  { keys: "Shift+F3", label: "Previous match", does: "goes to the previous match" },
  { keys: "Alt+F4", label: "Close the window", does: "closes the window" },
];
const FIXED_BY_KEYS = new Map(FIXED.map((f) => [f.keys, f]));

/** Why keys can't be recorded because they keep their meaning: "Ctrl+C copies and can't be changed.", or undefined. */
export function fixedReason(combo: string) {
  const fixed = FIXED_BY_KEYS.get(combo);
  return fixed && `${combo} ${fixed.does} and can't be changed.`;
}

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

/** Keys an action shares: with another action, or with a key that keeps its meaning when `other` is undefined. */
export type Clash = { keys: string; other?: ShortcutId };

/** For each action whose keys something else also uses, which keys and what else uses them. */
export function conflicts(bindings: Bindings): Partial<Record<ShortcutId, Clash[]>> {
  const users = new Map<string, ShortcutId[]>();
  for (const { id } of ITEMS) for (const combo of keysOf(bindings, id)) users.set(combo, [...(users.get(combo) ?? []), id]);
  const result: Partial<Record<ShortcutId, Clash[]>> = {};
  for (const { id } of ITEMS) {
    const clashes = keysOf(bindings, id).flatMap((keys): Clash[] => [
      ...(users.get(keys) ?? []).filter((other) => other !== id).map((other) => ({ keys, other })),
      ...(FIXED_BY_KEYS.has(keys) ? [{ keys }] : []),
    ]);
    if (clashes.length) result[id] = clashes;
  }
  return result;
}

/** What a clash says under its row: "Link also uses Ctrl+K." or "Ctrl+C copies and can't be changed." */
export const clashText = ({ keys, other }: Clash) => (other ? `${shortcutLabel(other)} also uses ${keys}.` : fixedReason(keys)!);

/** `bindings` with `keys` taken off action `from`, as Remove from … does when two actions share them. */
export const removeKeys = (bindings: Bindings, from: ShortcutId, keys: string) =>
  setKeys(bindings, from, keysOf(bindings, from).filter((k) => k !== keys));

/** `bindings` with the actions of a group back on their default keys. */
export function resetGroup(bindings: Bindings, ids: ShortcutId[]): Bindings {
  const result = { ...bindings };
  for (const id of ids) delete result[id];
  return result;
}

/** What a key press does while an action's shortcut is recorded: new bindings, the end of recording, or why it was refused. */
export type Recorded = { bindings: Bindings } | { cancel: true } | { refused: string };

/** The key press `combo` while action `id` records: Escape cancels, Backspace or Delete removes the shortcut. */
export function recordKey(bindings: Bindings, id: ShortcutId, combo: string): Recorded {
  if (combo === "Escape") return { cancel: true };
  if (combo === "Backspace" || combo === "Delete") return { bindings: setKeys(bindings, id, []) };
  const fixed = fixedReason(combo);
  if (fixed) return { refused: fixed };
  if (!isAssignable(combo)) return { refused: "Use Ctrl or Alt with a key, or a function key." };
  return { bindings: setKeys(bindings, id, [combo]) };
}

/** A row Find a shortcut shows: an action, or a key that keeps its meaning when `id` is undefined. */
export type FoundRow = {
  id?: ShortcutId;
  label: string;
  keys: string[];
  /** Where the typed text starts in the label, or -1. */
  at: number;
  /** The key caps the typed text names, lowercased, such as "ctrl" and "k". */
  caps: string[];
};

/** The typed text's place in an action's label and the key caps it names, or undefined when the action doesn't match. */
export function matchShortcut(query: string, label: string, keys: string[]): Pick<FoundRow, "at" | "caps"> | undefined {
  const q = query.trim().toLowerCase();
  if (!q) return { at: -1, caps: [] };
  const at = label.toLowerCase().indexOf(q);
  // "ctrl+k" matches keys with both a Ctrl and a K cap; "tab" any key with a Tab cap.
  const parts = q.split("+").filter(Boolean);
  const byKeys = parts.length > 0 && keys.some((k) => parts.every((p) => k.toLowerCase().split("+").includes(p)));
  return at >= 0 || byKeys ? { at, caps: byKeys ? parts : [] } : undefined;
}

/** The groups Find a shortcut shows, the keys that keep their meaning last, without the rows that don't match, and how many rows match. */
export function findShortcuts(query: string, bindings: Bindings) {
  const all = [
    ...SHORTCUT_GROUPS.map((g) => ({
      title: g.title,
      fixed: false,
      ids: g.items.map((i) => i.id),
      rows: g.items.map(({ id, label }) => ({ id, label, keys: keysOf(bindings, id) })),
    })),
    { title: "Keys that don't change", fixed: true, ids: [] as ShortcutId[], rows: FIXED.map(({ keys, label }) => ({ id: undefined, label, keys: [keys] })) },
  ];
  const groups = all
    .map((g) => ({
      ...g,
      rows: g.rows.flatMap((row): FoundRow[] => {
        const match = matchShortcut(query, row.label, row.keys);
        return match ? [{ ...row, ...match }] : [];
      }),
    }))
    .filter((g) => g.rows.length);
  return { groups, count: groups.reduce((n, g) => n + g.rows.length, 0) };
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
