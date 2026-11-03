import { sanitizeBindings, type Bindings } from "./shortcuts";
import { DEFAULT_SIDEBAR, storedSidebarWidth } from "./sidebarWidth";
import { fromStored, type Tabs } from "./tabs";
import type { TableWidths } from "./tableWidths";

// UI state kept between launches. Every access is wrapped: storage can be unavailable or hold junk.
// Limitation: localStorage lives in the webview profile; move to a settings file once Rust needs these.

export type Theme = "light" | "dark" | "system";
export const LINE_WIDTHS = ["narrow", "medium", "default", "wide", "wider"] as const;
export type LineWidth = (typeof LINE_WIDTHS)[number];
/** How diagrams and images open large from the reading view: from a button on them, a click on them, or both. */
export const OPEN_LARGE = ["button", "click", "both"] as const;
export type OpenLarge = (typeof OPEN_LARGE)[number];
export const OUTLINE_AT = ["sidebar", "right", "left"] as const;
export type OutlineAt = (typeof OUTLINE_AT)[number];
export type Prefs = {
  theme: Theme;
  font: "sans" | "serif";
  size: number;
  width: LineWidth;
  /** The Files sidebar is shown. */
  outline: boolean;
  /** The outline is shown somewhere: no tab, dashes or panel with this off. */
  showOutline: boolean;
  /** Where the outline is: a tab in the sidebar, or floating from a margin of the text when it is hovered. */
  outlineAt: OutlineAt;
  /** The frontmatter above the document while reading. */
  properties: boolean;
  /** Edits are saved a second after typing stops, when leaving a document and before closing. */
  autosave: boolean;
  /** The first save of a file in a session copies the original to the backups folder. */
  backups: boolean;
  /** Tables and code blocks wider than the text column grow into the space beside it. */
  wideBlocks: boolean;
  /** How diagrams and images open large; tables always open from their button. */
  openLarge: OpenLarge;
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
  /** Workspace scans include folders whose names start with a dot. */
  showHidden: boolean;
  /** The width of the sidebar, in pixels. */
  sidebarWidth: number;
};
export type RecentFile = { path: string; at: number };

export const DEFAULT_PREFS: Prefs = { theme: "system", font: "sans", size: 16, width: "default", outline: true, showOutline: true, outlineAt: "sidebar", properties: true, autosave: true, backups: true, wideBlocks: false, openLarge: "both", formatBarAlign: "left", formatBar: "toolbar", tableBar: "above", linkDetails: "bar", saveButtons: "bar", saveStatus: "status", shortcuts: {}, checkUpdates: true, showHidden: false, sidebarWidth: DEFAULT_SIDEBAR };

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

type Key = "prefs" | "recent" | "pinned" | "tabs" | `tabs:${string}` | "tableWidths" | "lastVersion" | "workspace" | "workspaceCopy";

export function save(key: Key, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export function forget(key: Key) {
  try {
    localStorage.removeItem(key);
  } catch {}
}

/** A stored line width, or the default one for anything that isn't a line width. */
export const lineWidth = (v: unknown): LineWidth => (LINE_WIDTHS.includes(v as LineWidth) ? (v as LineWidth) : DEFAULT_PREFS.width);

/** A stored way of opening diagrams and images large, or the default one for anything else. */
export const openLarge = (v: unknown): OpenLarge => (OPEN_LARGE.includes(v as OpenLarge) ? (v as OpenLarge) : DEFAULT_PREFS.openLarge);

/** A stored outline place, or the sidebar for anything else. */
export const outlineAt = (v: unknown): OutlineAt => (OUTLINE_AT.includes(v as OutlineAt) ? (v as OutlineAt) : DEFAULT_PREFS.outlineAt);

export const loadPrefs = (): Prefs => {
  const stored = load<Partial<Prefs>>("prefs", {});
  return { ...DEFAULT_PREFS, ...stored, width: lineWidth(stored.width), openLarge: openLarge(stored.openLarge), sidebarWidth: storedSidebarWidth(stored.sidebarWidth), outlineAt: outlineAt(stored.outlineAt), shortcuts: sanitizeBindings(stored.shortcuts) };
};
/** Where the tabs of workspace `id` are kept, or those shown with no workspace open. Deleting a workspace must remove its key too. */
export const tabsKey = (id?: string) => (id === undefined ? "tabs" : (`tabs:${id}` as const));
export const loadTabs = (workspace?: string): Tabs => ({ ...fromStored(load<unknown>(tabsKey(workspace), null)), workspace });
export const loadTableWidths = () => {
  const stored = load<unknown>("tableWidths", {});
  return (stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {}) as TableWidths;
};
/** The version that ran last time, to tell an update from a first launch. */
export const loadLastVersion = () => {
  const v = load<unknown>("lastVersion", undefined);
  return typeof v === "string" ? v : undefined;
};
const loadString = (key: string) => {
  const v = load<unknown>(key, undefined);
  return typeof v === "string" ? v : undefined;
};
/** The id of the workspace that was open. */
export const loadOpenWorkspace = () => loadString("workspace");
/** The kept copy of a saved workspaces file the user was last told about. */
export const loadToldCopy = () => loadString("workspaceCopy");
/** The pins not yet moved to the Pinned workspace; undefined when there is nothing left to move. */
export const loadPinned = () => {
  const stored = load<unknown>("pinned", undefined);
  return stored === undefined ? undefined : Array.isArray(stored) ? stored.filter((p): p is string => typeof p === "string") : [];
};

/** The recent files in `raw`, skipping anything that isn't a path with the time it was opened. */
export const recentFiles = (raw: unknown): RecentFile[] =>
  Array.isArray(raw) ? raw.filter((r): r is RecentFile => typeof r?.path === "string" && typeof r?.at === "number") : [];
export const loadRecent = () => recentFiles(load<unknown>("recent", []));
