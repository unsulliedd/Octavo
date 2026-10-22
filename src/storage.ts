import { sanitizeBindings, type Bindings } from "./shortcuts";
import { fromStored } from "./tabs";
import type { TableWidths } from "./tableWidths";

// UI state kept between launches. Every access is wrapped: storage can be unavailable or hold junk.
// Limitation: localStorage lives in the webview profile; move to a settings file once Rust needs these.

export type Theme = "light" | "dark" | "system";
export const LINE_WIDTHS = ["narrow", "medium", "default", "wide", "wider"] as const;
export type LineWidth = (typeof LINE_WIDTHS)[number];
export type Prefs = {
  theme: Theme;
  font: "sans" | "serif";
  size: number;
  width: LineWidth;
  outline: boolean;
  /** The frontmatter above the document while reading. */
  properties: boolean;
  /** Edits are saved a second after typing stops, when leaving a document and before closing. */
  autosave: boolean;
  /** The first save of a file in a session copies the original to the backups folder. */
  backups: boolean;
  /** Tables and code blocks wider than the text column grow into the space beside it. */
  wideBlocks: boolean;
  /** Where the formatting buttons sit in their row while editing. */
  formatBarAlign: "left" | "center";
  /** The formatting bar: a row under the toolbar, floating over selected text, both, or none. */
  formatBar: "toolbar" | "floating" | "both" | "hidden";
  /** The table tools: above the table, or down its left side. */
  tableBar: "above" | "side";
  /** The address of the link at the cursor: in the formatting bar, in a popover at the link, or both. */
  linkDetails: "bar" | "popover" | "both";
  /** Discard, Save as and Save: in the formatting bar row or the toolbar. */
  saveButtons: "bar" | "toolbar";
  /** Unsaved changes, Saving…, Saved: in the status bar, the toolbar or the formatting bar row. */
  saveStatus: "status" | "toolbar" | "bar";
  /** Shortcut keys changed in Settings; every other action keeps its default keys. */
  shortcuts: Bindings;
  /** Shortly after launch, Octavo looks for a newer release and downloads it in the background. */
  checkUpdates: boolean;
};
export type RecentFile = { path: string; at: number };

export const DEFAULT_PREFS: Prefs = { theme: "system", font: "sans", size: 16, width: "default", outline: true, properties: true, autosave: true, backups: true, wideBlocks: false, formatBarAlign: "left", formatBar: "toolbar", tableBar: "above", linkDetails: "bar", saveButtons: "bar", saveStatus: "status", shortcuts: {}, checkUpdates: true };

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function save(key: "prefs" | "recent" | "pinned" | "tabs" | "tableWidths" | "lastVersion", value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

/** A stored line width, or the default one for anything that isn't a line width. */
export const lineWidth = (v: unknown): LineWidth => (LINE_WIDTHS.includes(v as LineWidth) ? (v as LineWidth) : DEFAULT_PREFS.width);

export const loadPrefs = (): Prefs => {
  const stored = load<Partial<Prefs>>("prefs", {});
  return { ...DEFAULT_PREFS, ...stored, width: lineWidth(stored.width), shortcuts: sanitizeBindings(stored.shortcuts) };
};
export const loadTabs = () => fromStored(load<unknown>("tabs", null));
export const loadTableWidths = () => {
  const stored = load<unknown>("tableWidths", {});
  return (stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {}) as TableWidths;
};
/** The version that ran last time, to tell an update from a first launch. */
export const loadLastVersion = () => {
  const v = load<unknown>("lastVersion", undefined);
  return typeof v === "string" ? v : undefined;
};
export const loadPinned = () => load<string[]>("pinned", []).filter((p) => typeof p === "string");

/** The recent files in `raw`, skipping anything that isn't a path with the time it was opened. */
export const recentFiles = (raw: unknown): RecentFile[] =>
  Array.isArray(raw) ? raw.filter((r): r is RecentFile => typeof r?.path === "string" && typeof r?.at === "number") : [];
export const loadRecent = () => recentFiles(load<unknown>("recent", []));
