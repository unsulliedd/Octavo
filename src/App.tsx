import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ask, message, open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import { EditorPane } from "./editor/EditorPane";
import { DocButtons, type DocActions } from "./editor/FormatBar";
import { editorLayout } from "./editor/layout";
import { sameRendering } from "./editor/sameRendering";
import type { EditorSession, Snapshot } from "./editor/session";
import { editorText, fileFormat, textToSave, toFileText } from "./fileText";
import { CompareView } from "./CompareView";
import { diskChange } from "./conflict";
import { canRevert, revertText } from "./editSession";
import { FindBar } from "./FindBar";
import { basename, folderTrail, Home } from "./Home";
import { Icon } from "./icons";
import { pastedName, watchBrokenImages } from "./images";
import { addOpenButtons, largeContent, type LargeContent } from "./largeView";
import { LargeViewer } from "./LargeViewer";
import { widenBlocks } from "./breakout";
import { afterPaint } from "./paint";
import { shareInFlight } from "./shared";
import { ReadingSettings } from "./ReadingSettings";
import { Settings } from "./Settings";
import { SourcePane } from "./SourcePane";
import { UpdatePopover } from "./UpdatePopover";
import { TabMenu, type TabMenuItem } from "./TabMenu";
import { releaseUrl } from "./links";
import { useUpdates } from "./useUpdates";
import { changelogSection, notesPage, showAfterUpdate } from "./whatsNew";
import type { SourceEditor } from "./sourceEditor";
import type { SourceSession, SourceSnapshot } from "./sourceSession";
import { keyLabel, shortcut, withKeys, type Action, type ShortcutId } from "./shortcuts";
import { KeysContext } from "./useKeys";
import { dirname, joinPath, relativePath, resolveLocal, safeDecode } from "./paths";
import { anchorAt, scrollTopFor, type Anchor } from "./scrollAnchor";
import { createRenderer } from "./renderClient";
import { loadLastVersion, loadPinned, loadPrefs, loadRecent, loadTableWidths, loadTabs, save } from "./storage";
import { addResizeHandles, applyWidths, headersOf } from "./tableResize";
import { savedWidths, withWidths } from "./tableWidths";
import type { LineWidth, Prefs, RecentFile } from "./storage";
import {
  activate,
  closeTab,
  currentEntry,
  cycle,
  dropIndex,
  go as goInTab,
  goHome,
  historyTarget,
  moveTab,
  openPaths,
  openTab,
  otherTabIds,
  renamePath,
  reopenTab,
  replaceCurrent,
  samePath,
  setScroll,
  shownTab,
  tabIdsRightOf,
  tabFor,
  toStored,
  type Tabs,
} from "./tabs";

const MD = /\.(md|markdown)$/i;

/**
 * The image files a document links for `files`: files in its repository (or folder) as they are, others copied
 * into its image folder, so the links still work after a commit. Empty, after saying why, when that fails.
 */
const placeImages = (doc: string, files: string[]) =>
  invoke<string[]>("place_images", { dir: dirname(doc), paths: files }).catch(async (e) => {
    await message(`The image couldn't be added: ${e}`, { kind: "error" });
    return [] as string[];
  });

/** An image file as the document links it: its path relative to the document, and its name as alt text. */
const imageRef = (doc: string, file: string) => ({ src: relativePath(dirname(doc), file), alt: basename(file).replace(/\.[^.]+$/, "") });
const IMAGE_TYPES = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif"];
const IMAGE_FILE = new RegExp(`\\.(${IMAGE_TYPES.join("|")})$`, "i");
const WIDTHS: Record<LineWidth, string> = { narrow: "600px", medium: "720px", default: "920px", wide: "1120px", wider: "1320px" };
/** How far the pointer moves on a pressed tab before the tab is dragged instead of clicked, in pixels. */
const TAB_DRAG_START = 5;

type Doc = { path: string; text: string; html: string };
/**
 * Edits not yet written to the file: the editor's Markdown, once rendered its HTML for reading, the file
 * text the edits were made to, whether the Markdown loads back as exactly what was edited, and whether it
 * was typed in Source mode, so the editor checks it can keep it before opening it.
 */
type Draft = { text: string; html?: string; base: string; exact: boolean; source?: boolean };

/** The views of an edit session: the editor, the Markdown source, or the reading view of the edits. */
type Mode = "edit" | "source" | "preview";

/** Edits are saved this long after the last change. */
const AUTOSAVE_DELAY = 1000;

type SaveState = { state: "unsaved" | "saving" | "saved" | "error"; message?: string };
const SAVE_LABELS: Record<SaveState["state"], string> = {
  unsaved: "Unsaved changes",
  saving: "Saving…",
  saved: "Saved",
  error: "Not saved",
};

const CHANGED_ON_DISK = "the file changed on disk while it had unsaved edits.";

const NOT_EXACT =
  "the editor can't write part of this document as Markdown that opens the same way again (for example inline code containing | in a table cell). Nothing was written; undo or change the last edit and save again.";

const EDIT_BLOCKED =
  "The editor would change how parts of this document look when it saves, so it opens in Source mode: edit its Markdown as text.";

/** Renders documents in a Web Worker; falls back to the main thread if a worker can't run. */
const renderDoc = createRenderer(
  () => new Worker(new URL("./render.worker.ts", import.meta.url), { type: "module" }),
  () => import("./render").then((m) => m.render),
  afterPaint, // a main-thread render blocks the window, so the loading indicator is drawn first
);
type Heading = { id: string; text: string; level: number };

/** Mermaid is loaded only for documents that contain a mermaid block. */
async function renderMermaid(root: HTMLElement, dark: boolean) {
  const blocks = root.querySelectorAll("pre > code.language-mermaid");
  if (!blocks.length) return;
  const { default: mermaid } = await import("mermaid");
  mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: dark ? "dark" : "default" });
  const nodes = [...blocks].map((code) => {
    const div = document.createElement("div");
    div.className = "mermaid";
    div.textContent = code.textContent;
    code.parentElement!.replaceWith(div);
    return div;
  });
  await mermaid.run({ nodes, suppressErrors: true });
}

function useSystemDark() {
  const [dark, setDark] = useState(() => matchMedia("(prefers-color-scheme: dark)").matches);
  useEffect(() => {
    const query = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setDark(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return dark;
}

export default function App() {
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [recent, setRecent] = useState<RecentFile[]>(loadRecent);
  const [pinned, setPinned] = useState<string[]>(loadPinned);
  const [tabs, setTabs] = useState<Tabs>(loadTabs);
  // Rendered documents by path, for the documents the tabs show.
  const [docs, setDocs] = useState<Record<string, Doc>>({});
  const [loadErrors, setLoadErrors] = useState<Record<string, string>>({});
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [activeId, setActiveId] = useState<string>();
  const [words, setWords] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [showAppSettings, setShowAppSettings] = useState(false);
  const [showUpdate, setShowUpdate] = useState(false);
  const updates = useUpdates(prefs.checkUpdates);
  const [focusMode, setFocusMode] = useState(false);
  // The diagram, image or table open large over the window.
  const [large, setLarge] = useState<LargeContent>();
  const [find, setFind] = useState({ open: false, query: "", focusKey: 0 });
  // Counts finished renders of the document (after diagrams), so find searches the final DOM.
  const [rendered, setRendered] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [version, setVersion] = useState("");
  const [error, setError] = useState<string>();
  // Documents being read and rendered for openPath, shown with a loading indicator.
  const [opening, setOpening] = useState<string[]>([]);
  // Set once the file passed on the command line, if any, has started opening.
  const [started, setStarted] = useState(false);
  // Tabs in edit mode, edits by document path, and documents the editor can't handle safely.
  const [editingTabs, setEditingTabs] = useState<number[]>([]);
  // Tabs showing the Markdown source of their edit session.
  const [sourceTabs, setSourceTabs] = useState<number[]>([]);
  // Edit sessions by document path, from Edit to Done: the file's text when editing started, for Revert.
  const [originals, setOriginals] = useState<Record<string, string>>({});
  const originalsRef = useRef(originals);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const draftsRef = useRef(drafts);
  // Save progress by path, for the status bar.
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
  const autosaves = useRef(new Map<string, number>());
  // Saves run one after another, so each sees what the previous one wrote.
  const saveQueue = useRef(Promise.resolve<string | undefined>(undefined));
  // The file text on disk for documents whose unsaved edits conflict with a change on disk.
  const [conflicts, setConflicts] = useState<Record<string, string>>({});
  const conflictsRef = useRef(conflicts);
  const [compare, setCompare] = useState<{ file: string; disk: string; mine: string }>();
  // Bumped to load a document into the editor again after it changed on disk.
  const [editorLoads, setEditorLoads] = useState<Record<string, number>>({});
  // The editor that has finished loading, by pane key, and its document element; the reading view shows until then.
  const [editorShown, setEditorShown] = useState<{ key: string; root: HTMLElement }>();
  // Column widths set by hand in the reading view, by file and table.
  const tableWidths = useRef(loadTableWidths());
  // The row under the toolbar the editor puts its formatting bar in.
  const [formatSlot, setFormatSlot] = useState<HTMLElement | null>(null);
  const [editBlocked, setEditBlocked] = useState<Record<string, string>>({});
  // Documents whose editor round trip renders like the file; checked once per load of the file.
  const verified = useRef(new Set<string>());
  // The open editor's or Source view's session.
  const session = useRef<EditorSession | SourceSession>(undefined);
  // The open Source view, where its outline's headings start, and the timer that updates them while typing.
  const sourceEditor = useRef<SourceEditor>(undefined);
  const sourceHeadingStarts = useRef<number[]>([]);
  const sourceOutline = useRef<number>(undefined);
  // The file text the open editor's edits are made to.
  const editBase = useRef<{ path: string; base: string }>(undefined);
  const pendingAnchor = useRef<Anchor>(undefined);
  const article = useRef<HTMLElement>(null);
  const scroller = useRef<HTMLElement>(null);
  const tabStrip = useRef<HTMLElement>(null);
  // The tab being dragged to a new place in the strip.
  const [draggedTab, setDraggedTab] = useState<number>();
  // The tab a right-click menu is open for, and where the pointer was.
  const [tabMenu, setTabMenu] = useState<{ id: number; x: number; y: number }>();
  const appRoot = useRef<HTMLDivElement>(null);
  const windowShown = useRef(false);
  const systemDark = useSystemDark();
  const dark = prefs.theme === "dark" || (prefs.theme === "system" && systemDark);

  // No tab while the home screen shows, even with tabs open.
  const tab = shownTab(tabs);
  const path = tab && currentEntry(tab).path;
  const doc = path ? docs[path] : undefined;
  const draft = path ? drafts[path] : undefined;
  const saveState = path ? saveStates[path] : undefined;
  const editing = !!(tab && doc && path && editingTabs.includes(tab.id) && !editBlocked[path]);
  const source = !!(tab && doc && path && sourceTabs.includes(tab.id));
  // The reading view shows the edits, once they are rendered.
  const shownHtml = draft ? draft.html : doc?.html;
  const editorKey = path && `${path}:${editorLoads[path] ?? 0}`;
  const editorReady = editing && editorShown?.key === editorKey;
  const shownPath = useRef(path);
  shownPath.current = path;

  const changePrefs = (next: Prefs) => {
    setPrefs(next);
    save("prefs", next);
  };

  /** Changes the tabs, first remembering where the shown document is scrolled to. */
  function changeTabs(fn: (s: Tabs) => Tabs) {
    const top = scroller.current?.scrollTop;
    setTabs((s) => fn(s.active !== undefined && top !== undefined ? setScroll(s, s.active, top) : s));
  }

  async function load(path: string) {
    const d = await invoke<{ path: string; text: string }>("open_doc", { path });
    const { html, images, math } = await renderDoc(d.text, dirname(d.path), convertFileSrc(""));
    if (math) await import("katex/dist/katex.min.css");
    // Images outside the document's folder (../img.png) load once each file is allowed.
    if (images.length) await invoke("allow_images", { paths: images }).catch(() => {});
    const loaded = { ...d, html };
    verified.current.delete(d.path);
    setDocs((all) => ({ ...all, [d.path]: loaded }));
    setLoadErrors(({ [d.path]: _, ...rest }) => rest);
    return loaded;
  }
  // Opening a file and showing a restored tab can ask for the same document at once (a launch with the
  // file that was open last time); they share one read and render. load only uses state setters, so the
  // first render's copy stays valid. Reloads after a change on disk call load directly to read fresh.
  const loadShared = useRef(shareInFlight((p: string) => load(p))).current;

  /** Switches to the tab showing `path`, or opens it in a new tab; `from` is the tab whose link was clicked. */
  /** Opens `path` in a tab, or switches to the tab that shows it. With `recent`, it joins the recent files. */
  async function openPath(path: string, from?: number, recent = true) {
    const shown = tabFor(tabs, path);
    const cached = shown && docs[currentEntry(shown).path];
    if (!cached) setOpening((all) => [...all, path]);
    try {
      const d = cached || (await loadShared(path));
      changeTabs((s) => openTab(s, d.path, from));
      setError(undefined);
      if (recent) setRecent((r) => {
        const next = [{ path: d.path, at: Date.now() }, ...r.filter((x) => x.path !== d.path)].slice(0, 12);
        save("recent", next);
        return next;
      });
    } catch (e) {
      setError(String(e));
    } finally {
      if (!cached) setOpening((all) => all.filter((p) => p !== path));
    }
  }

  /**
   * Opens What's new for `version` in a tab: `notes` when given (an update's own release notes), else that
   * version's section of the changelog bundled with the app.
   */
  async function openWhatsNew(version: string, notes?: string, date?: string) {
    try {
      if (notes === undefined) {
        const { default: changelog } = await import("../CHANGELOG.md?raw");
        const section = changelogSection(changelog, version);
        notes = section?.body ?? "";
        date = section?.date;
      }
      const file = await invoke<string>("write_notes", { version, text: notesPage(version, notes, date) });
      await openPath(file, undefined, false);
    } catch (e) {
      setError(String(e));
    }
  }

  async function pick() {
    const path = await openDialog({ filters: [{ name: "Markdown", extensions: ["md", "markdown"] }] });
    if (typeof path === "string") openPath(path);
  }

  // A document changed on disk is read again after its writes settle. The shown one keeps its scroll position.
  const reloadTimers = useRef(new Map<string, number>());
  const keepScroll = useRef<number>(undefined);
  function reloadSoon(changed: string) {
    const shown = Object.keys(docs).find((p) => samePath(p, changed));
    if (!shown) return;
    clearTimeout(reloadTimers.current.get(shown));
    reloadTimers.current.set(
      shown,
      window.setTimeout(() => {
        reloadTimers.current.delete(shown);
        if (shown === shownPath.current) keepScroll.current = scroller.current?.scrollTop;
        load(shown).then(
          (d) => latest.current.changedOnDisk(shown, d.text),
          (e) => {
            keepScroll.current = undefined;
            setLoadErrors((all) => ({ ...all, [shown]: String(e) }));
          },
        );
      }, 200),
    );
  }

  /** Where the view is, relative to the headings of what it shows (reading view, editor or source). */
  function headingTops() {
    const sc = scroller.current;
    const root = article.current;
    if (!sc) return [];
    const base = sc.getBoundingClientRect().top - sc.scrollTop;
    if (source) return sourceEditor.current?.headingTops().map((top) => top - base) ?? [];
    if (!root) return [];
    return [...root.querySelectorAll("h1, h2, h3, h4, h5, h6")].map((h) => h.getBoundingClientRect().top - base);
  }

  /** The outline of the source: its headings down to level 4, by where each starts in the text. */
  function showSourceHeadings() {
    const found = sourceEditor.current?.headings().filter((h) => h.level <= 4) ?? [];
    sourceHeadingStarts.current = found.map((h) => h.from);
    setHeadings(found.map((h, i) => ({ id: `source-heading-${i}`, text: h.text, level: h.level })));
  }
  const currentAnchor = () => anchorAt(headingTops(), scroller.current?.scrollTop ?? 0, scroller.current?.scrollHeight ?? 0);
  function restoreAnchor() {
    const sc = scroller.current;
    if (!sc || !pendingAnchor.current) return;
    sc.scrollTop = scrollTopFor(pendingAnchor.current, headingTops(), sc.scrollHeight);
    pendingAnchor.current = undefined;
  }

  async function renderDraft(file: string, text: string) {
    const { html, math } = await renderDoc(text, dirname(file), convertFileSrc(""));
    if (math) await import("katex/dist/katex.min.css");
    return html;
  }

  /** Changes the drafts; saves read them from the ref, so they always see the latest. */
  function updateDrafts(fn: (all: Record<string, Draft>) => Record<string, Draft>) {
    draftsRef.current = fn(draftsRef.current);
    setDrafts(draftsRef.current);
  }

  function setSaveState(file: string, next: SaveState | undefined) {
    setSaveStates(({ [file]: current, ...rest }) => {
      if (current?.state === next?.state && current?.message === next?.message) return current ? { ...rest, [file]: current } : rest;
      return next ? { ...rest, [file]: next } : rest;
    });
  }

  function updateOriginals(fn: (all: Record<string, string>) => Record<string, string>) {
    originalsRef.current = fn(originalsRef.current);
    setOriginals(originalsRef.current);
  }
  const endSession = (file: string) => updateOriginals(({ [file]: _, ...rest }) => rest);

  /** The Edit / Done shortcut and button: starts an edit session, or ends it with Done. */
  async function toggleEdit() {
    if (!path) return;
    if (originalsRef.current[path] === undefined) return startEditing();
    await finishEditing();
  }

  /**
   * Edit: the file's text is kept as it is now, for Revert, and the editor opens, or the source with `mode`
   * "source". A document the editor can't keep exactly opens in Source mode.
   */
  function startEditing(mode: Mode = "edit") {
    if (!tab || !doc || !path) return;
    if (originalsRef.current[path] === undefined) updateOriginals((all) => ({ ...all, [path]: draftsRef.current[path]?.base ?? doc.text }));
    void setMode(mode === "edit" && editBlocked[path] ? "source" : mode);
  }

  /** Preview: the reading view of the edits, without ending the session; again goes back to editing. */
  async function togglePreview() {
    if (!path || originalsRef.current[path] === undefined) return;
    await setMode(editing || source ? "preview" : editBlocked[path] ? "source" : "edit");
  }

  /** The Source shortcut: the Markdown source, starting an edit session if there is none; again goes back to the editor. */
  async function toggleSource() {
    if (!path) return;
    if (originalsRef.current[path] === undefined) return startEditing("source");
    await setMode(!source ? "source" : editBlocked[path] ? "preview" : "edit");
  }

  /** Done: the edits are saved and the session ends; Revert can no longer bring the original back. */
  async function finishEditing() {
    if (!path) return;
    const file = path;
    await setMode("preview");
    endSession(file);
    if (hasEdits(file)) await saveDoc(file);
  }

  /** Switches the edit session's view; unsaved edits of the view it leaves are kept as a draft, rendered for reading. */
  async function setMode(mode: Mode) {
    if (!tab || !doc || !path || originalsRef.current[path] === undefined) return;
    const current: Mode = editing ? "edit" : source ? "source" : "preview";
    if (mode === current || (mode === "edit" && editBlocked[path])) return;
    const s = session.current;
    if (current !== "preview" && s) {
      if (s.edited()) {
        const snapshot = s.snapshot(baseFor(path));
        keepDraft(path, snapshot, await renderDraft(path, snapshot.markdown));
      }
      session.current = undefined; // its edits are kept; the view closing doesn't need to keep them again
    }
    pendingAnchor.current = currentAnchor();
    const id = tab.id;
    setEditingTabs((t) => [...t.filter((x) => x !== id), ...(mode === "edit" ? [id] : [])]);
    setSourceTabs((t) => [...t.filter((x) => x !== id), ...(mode === "source" ? [id] : [])]);
  }

  /** Keeps a snapshot of `file` as its draft. Edits typed in Source mode let the editor check the document again. */
  function keepDraft(file: string, snapshot: Snapshot | SourceSnapshot, html?: string) {
    const typed = "source" in snapshot;
    updateDrafts((all) => ({ ...all, [file]: { text: snapshot.markdown, html, base: baseFor(file), exact: snapshot.exact, source: typed } }));
    if (typed) setEditBlocked(({ [file]: _, ...rest }) => rest);
  }

  /** The editor or source of `file` closes (tab switch, link, tab closed): its edits stay as a draft and are saved right away. */
  function keepEdits(file: string, s: EditorSession | SourceSession) {
    if (session.current !== s) return;
    session.current = undefined;
    if (!s.edited()) return;
    const snapshot = s.snapshot(baseFor(file));
    const text = snapshot.markdown;
    keepDraft(file, snapshot);
    saveSoon(file, 0);
    renderDraft(file, text).then(
      (html) => updateDrafts((all) => (all[file]?.text === text ? { ...all, [file]: { ...all[file], html } } : all)),
      () => {},
    );
  }

  /** The file text the edits to `file` are made to. */
  function baseFor(file: string) {
    if (editBase.current?.path === file) return editBase.current.base;
    return draftsRef.current[file]?.base ?? docs[file]?.text ?? "";
  }

  /** The editor showing `file`, if one is open. */
  const sessionFor = (file: string) => (editBase.current?.path === file ? session.current : undefined);

  /** Whether `file` has edits that are not written to it. */
  const hasEdits = (file: string) => !!draftsRef.current[file] || !!sessionFor(file)?.edited();

  /** Saves `file` after `delay` ms, replacing an earlier pending autosave. Does nothing with autosave off. */
  function saveSoon(file: string, delay = AUTOSAVE_DELAY) {
    if (!prefs.autosave) return;
    clearTimeout(autosaves.current.get(file));
    autosaves.current.set(
      file,
      window.setTimeout(() => {
        autosaves.current.delete(file);
        void saveDoc(file);
      }, delay),
    );
  }

  /**
   * Saves `file`, or writes it to `target` (Save As), after any save already running. Resolves to an error
   * message, or undefined once there is nothing left unsaved.
   */
  function saveDoc(file: string, target?: string): Promise<string | undefined> {
    clearTimeout(autosaves.current.get(file));
    autosaves.current.delete(file);
    const run = saveQueue.current.then(() => latest.current.writeDoc(file, target));
    saveQueue.current = run.catch(() => undefined);
    return run;
  }

  /**
   * Writes the edits to `file`, or the document to `target` (Save As). Nothing is written when there are no
   * edits or they leave the file as it is, when the editor's Markdown would not open as what was edited,
   * or when the file no longer holds the text the edits were made to.
   */
  async function writeDoc(file: string, target?: string): Promise<string | undefined> {
    const doc = docs[file];
    if (!doc) return undefined;
    const other = target !== undefined && !samePath(target, file);
    if (!other && conflictsRef.current[file] !== undefined) return CHANGED_ON_DISK;
    const s = sessionFor(file);
    const snapshot = s?.edited() ? s.snapshot(baseFor(file)) : undefined;
    const draft = draftsRef.current[file];
    const edited = snapshot?.markdown ?? draft?.text;
    const base = edited === undefined ? doc.text : baseFor(file);
    if (edited === undefined && !other) {
      setSaveStates((all) => (all[file] ? { ...all, [file]: { state: "saved" } } : all));
      return undefined;
    }
    const fail = (message: string) => {
      setSaveState(target ?? file, { state: "error", message: `Couldn't save ${basename(target ?? file)}: ${message}` });
      return message;
    };
    if (edited !== undefined && !(snapshot ? snapshot.exact : draft?.exact)) return fail(NOT_EXACT);
    const text = other ? (edited === undefined ? base : toFileText(edited, fileFormat(base))) : textToSave(base, edited);
    setSaveState(file, { state: "saving" });
    try {
      if (text !== undefined) await invoke<boolean>("save_doc", { path: target ?? file, text, expected: other ? null : base, backup: prefs.backups });
    } catch (e) {
      setSaveState(file, undefined);
      return fail(String(e));
    }
    const written = text ?? base;
    // The snapshot came from this session, so it is the kind it takes back.
    if (snapshot) s!.markSaved(snapshot as Snapshot);
    updateDrafts(({ [file]: _, ...rest }) => rest);
    if (!other) {
      if (editBase.current?.path === file) editBase.current.base = written;
      // Edits made while the file was written are saved next.
      const more = !!s?.edited();
      setSaveState(file, { state: more ? "unsaved" : "saved" });
      if (more) saveSoon(file);
      if (text !== undefined) {
        const { html } = await renderDoc(written, dirname(file), convertFileSrc(""));
        verified.current.delete(file);
        setDocs((all) => ({ ...all, [file]: { path: file, text: written, html } }));
      }
      return undefined;
    }
    // Save As: the tab shows the new file; edits made while it was written stay as edits to it.
    setSaveState(file, undefined);
    const later = s?.edited() ? s.snapshot(written) : undefined;
    if (s) session.current = undefined;
    try {
      const d = await load(target);
      // An edit session moves to the new file, starting from what was just written to it.
      updateOriginals(({ [file]: started, ...rest }) => (started === undefined ? rest : { ...rest, [d.path]: d.text }));
      if (later) {
        updateDrafts((all) => ({ ...all, [d.path]: { text: later.markdown, base: d.text, exact: later.exact, source: "source" in later } }));
        setSaveState(d.path, { state: "unsaved" });
        saveSoon(d.path);
      }
      const shown = tabFor(tabs, file);
      if (shown) changeTabs((t) => replaceCurrent(t, shown.id, d.path));
      setRecent((r) => {
        const next = [{ path: d.path, at: Date.now() }, ...r.filter((x) => x.path !== d.path)].slice(0, 12);
        save("recent", next);
        return next;
      });
    } catch (e) {
      setError(String(e));
    }
    return undefined;
  }

  async function saveAs() {
    if (!path || !doc) return;
    const target = await saveDialog({ defaultPath: path, filters: [{ name: "Markdown", extensions: ["md", "markdown"] }] });
    if (typeof target === "string") await saveDoc(path, target);
  }

  /**
   * Saves every document with unsaved edits. Resolves to the messages of the saves that failed, each
   * naming its file.
   */
  /** Every document with unsaved edits. */
  function filesWithEdits() {
    const files = new Set(Object.keys(draftsRef.current));
    const open = editBase.current?.path;
    if (open && sessionFor(open)?.edited()) files.add(open);
    return [...files];
  }

  async function saveAll() {
    const failed: string[] = [];
    for (const file of filesWithEdits()) {
      const message = await saveDoc(file);
      if (message) failed.push(`${basename(file)}: ${message}`);
    }
    return failed;
  }

  function updateConflicts(fn: (all: Record<string, string>) => Record<string, string>) {
    conflictsRef.current = fn(conflictsRef.current);
    setConflicts(conflictsRef.current);
  }

  /**
   * `file` was read again after a change on disk. Unsaved edits made to an older version are kept and
   * not saved until the user chooses; an editor without edits shows the new version.
   */
  function changedOnDisk(file: string, disk: string) {
    const editorOpen = editBase.current?.path === file && !!session.current;
    const change = diskChange({ disk, base: baseFor(file), edited: hasEdits(file), editorOpen });
    if (change === "conflict") {
      clearTimeout(autosaves.current.get(file));
      autosaves.current.delete(file);
      updateConflicts((all) => ({ ...all, [file]: disk }));
      setSaveState(file, { state: "error" });
      setCompare((c) => (c?.file === file ? { ...c, disk } : c));
      return;
    }
    if (change === "reloadEditor") setEditorLoads((all) => ({ ...all, [file]: (all[file] ?? 0) + 1 }));
    // The file is back to the text the edits were made to.
    if (conflictsRef.current[file] !== undefined) {
      updateConflicts(({ [file]: _, ...rest }) => rest);
      setCompare((c) => (c?.file === file ? undefined : c));
      setSaveState(file, { state: "unsaved" });
      saveSoon(file);
    }
  }

  /** Conflict: drops the unsaved edits and shows the file as it is on disk. */
  function reloadFromDisk(file: string) {
    const editorOpen = editBase.current?.path === file;
    discardEdits(file);
    updateConflicts(({ [file]: _, ...rest }) => rest);
    setCompare(undefined);
    if (editorOpen) setEditorLoads((all) => ({ ...all, [file]: (all[file] ?? 0) + 1 }));
  }

  /** Conflict: writes the unsaved edits over the file on disk. */
  function keepMine(file: string) {
    const disk = conflictsRef.current[file];
    if (disk === undefined) return;
    if (editBase.current?.path === file) editBase.current.base = disk;
    updateDrafts((all) => (all[file] ? { ...all, [file]: { ...all[file], base: disk } } : all));
    updateConflicts(({ [file]: _, ...rest }) => rest);
    setCompare(undefined);
    void saveDoc(file);
  }

  function openCompare(file: string) {
    const disk = conflictsRef.current[file];
    const mine = sessionFor(file)?.snapshot(baseFor(file)).markdown ?? draftsRef.current[file]?.text;
    if (disk !== undefined && mine !== undefined) setCompare({ file, disk, mine });
  }

  /**
   * Revert to original: after asking, drops the session's edits and, when the file was already saved during
   * the session, writes back the text it had when editing started. The session ends.
   */
  async function revertToOriginal(file: string) {
    const original = originalsRef.current[file];
    const onDisk = docs[file]?.text;
    if (original === undefined || onDisk === undefined) return;
    const revert = await ask(`Revert ${basename(file)} to how it was when you started editing? The edits made since then are lost.`, {
      title: "Octavo",
      kind: "warning",
      okLabel: "Revert",
      cancelLabel: "Keep editing",
    });
    if (!revert) return;
    // No autosave may write over the original; a save already running finishes first.
    clearTimeout(autosaves.current.get(file));
    autosaves.current.delete(file);
    await saveQueue.current;
    if (conflictsRef.current[file] !== undefined) {
      setSaveState(file, { state: "error", message: `Couldn't revert ${basename(file)}: ${CHANGED_ON_DISK}` });
      return;
    }
    // The file as it is now, after the saves of this session.
    let disk = onDisk;
    try {
      disk = (await invoke<{ text: string }>("open_doc", { path: file })).text;
    } catch {
      // Unreadable: the write below reports it.
    }
    const text = revertText({ original, onDisk: disk, unsaved: hasEdits(file) });
    if (text !== undefined) {
      // The edits are kept until the original is written, so a refused write loses nothing.
      try {
        await invoke<boolean>("save_doc", { path: file, text, expected: disk, backup: false });
      } catch (e) {
        setSaveState(file, { state: "error", message: `Couldn't revert ${basename(file)}: ${e}` });
        return;
      }
      const { html } = await renderDoc(text, dirname(file), convertFileSrc(""));
      verified.current.delete(file);
      setDocs((all) => ({ ...all, [file]: { path: file, text, html } }));
    }
    discardEdits(file);
    endSession(file);
    if (editBase.current?.path === file) session.current = undefined;
    const shown = tabFor(tabs, file);
    if (shown) setEditingTabs((t) => t.filter((id) => id !== shown.id));
    if (shown) setSourceTabs((t) => t.filter((id) => id !== shown.id));
    setEditorLoads((all) => ({ ...all, [file]: (all[file] ?? 0) + 1 }));
  }

  /** Drops the unsaved edits to `file`, after the user chose to. */
  function discardEdits(file: string) {
    clearTimeout(autosaves.current.get(file));
    autosaves.current.delete(file);
    if (sessionFor(file)) session.current = undefined;
    updateDrafts(({ [file]: _, ...rest }) => rest);
    updateConflicts(({ [file]: _, ...rest }) => rest);
    setCompare((c) => (c?.file === file ? undefined : c));
    setSaveState(file, undefined);
  }

  /**
   * With autosave off, asks whether to save the unsaved edits to `names` before closing. With autosave on,
   * they are saved without asking.
   */
  async function askToSave(names: string): Promise<"save" | "discard" | "cancel"> {
    if (prefs.autosave) return "save";
    try {
      const choice = await message(`Save your changes to ${names} before closing?`, {
        title: "Octavo",
        kind: "warning",
        buttons: { yes: "Save", no: "Don't save", cancel: "Cancel" },
      });
      return choice === "Save" ? "save" : choice === "Don't save" ? "discard" : "cancel";
    } catch {
      // Without the dialog, the edits are saved as with autosave.
      return "save";
    }
  }

  /** Before the window closes: saves unsaved edits, or asks. Resolves to whether the window may close. */
  async function confirmWindowClose() {
    const files = filesWithEdits();
    if (!files.length) return true;
    const choice = await askToSave(files.map(basename).join(", "));
    if (choice !== "save") return choice === "discard";
    const failed = await saveAll();
    if (!failed.length) return true;
    return ask(`These documents couldn't be saved:\n\n${failed.join("\n")}\n\nClose Octavo anyway and lose the unsaved edits?`, {
      title: "Octavo",
      kind: "warning",
      okLabel: "Close without saving",
      cancelLabel: "Keep open",
    });
  }

  /** Restart now: unsaved edits are handled as when the window closes, then the downloaded update installs. */
  async function restartToUpdate() {
    if (!(await confirmWindowClose())) return;
    await updates.install();
  }

  /**
   * Dragging a tab, from a press on it: once the pointer has moved a few pixels, the tab is shown and moves past
   * every other tab whose middle the pointer passes, so the others make room. Releasing keeps the new order;
   * Escape puts the tab back and shows what was shown before.
   */
  function startTabDrag(e: ReactPointerEvent, id: number) {
    const startX = e.clientX;
    const from = tabs.tabs.findIndex((t) => t.id === id);
    const { active, home } = tabs;
    let dragging = false;
    const move = (ev: PointerEvent) => {
      if (!dragging && Math.abs(ev.clientX - startX) < TAB_DRAG_START) return;
      dragging = true;
      setDraggedTab(id);
      const others = [...(tabStrip.current?.querySelectorAll<HTMLElement>("[data-tab-id]") ?? [])].filter((el) => el.dataset.tabId !== String(id));
      const mids = others.map((el) => {
        const r = el.getBoundingClientRect();
        return r.left + r.width / 2;
      });
      changeTabs((s) => moveTab(s, id, dropIndex(mids, ev.clientX)));
    };
    const key = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape") return;
      ev.preventDefault();
      ev.stopPropagation();
      if (dragging) changeTabs((s) => ({ ...moveTab(s, id, from), active, home }));
      end();
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("keydown", key, true);
      setDraggedTab(undefined);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("keydown", key, true);
  }

  /**
   * Closes a tab; unsaved edits are saved first (with autosave off, after asking). If saving fails, the
   * user decides whether to close anyway. Resolves to whether the tab was closed.
   */
  async function closeTabById(id: number) {
    const t = tabs.tabs.find((x) => x.id === id);
    if (!t) return false;
    const file = currentEntry(t).path;
    if (hasEdits(file)) {
      const choice = await askToSave(basename(file));
      if (choice === "cancel") return false;
      const message = choice === "discard" ? undefined : await saveDoc(file);
      if (choice === "discard") discardEdits(file);
      else if (message) {
        const discard = await ask(`${basename(file)} couldn't be saved: ${message}\n\nClose it anyway and lose the unsaved edits?`, {
          title: "Octavo",
          kind: "warning",
          okLabel: "Close without saving",
          cancelLabel: "Keep open",
        });
        if (!discard) return false;
        discardEdits(file);
      }
    }
    endSession(file);
    changeTabs((s) => closeTab(s, id));
    return true;
  }

  /** Closes these tabs one after another, each as Close does; a tab kept open (Cancel) stops the rest. */
  async function closeTabsById(ids: number[]) {
    for (const id of ids) if (!(await closeTabById(id))) return;
  }

  const closeTabMenu = useCallback(() => setTabMenu(undefined), []);

  /** The tab menu's items for tab `id`. */
  function tabMenuItems(id: number): TabMenuItem[] {
    const t = tabs.tabs.find((x) => x.id === id);
    if (!t) return [];
    const file = currentEntry(t).path;
    return [
      { label: "Open containing folder", run: () => void revealItemInDir(file).catch((e) => setError(String(e))) },
      { label: "Copy path", run: () => void navigator.clipboard.writeText(file).catch((e) => setError(String(e))) },
      "separator",
      { label: "Close", keys: keyLabel(bindings, "closeTab"), run: () => void closeTabById(id) },
      { label: "Close others", disabled: !otherTabIds(tabs, id).length, run: () => void closeTabsById(otherTabIds(tabs, id)) },
      { label: "Close tabs to the right", disabled: !tabIdsRightOf(tabs, id).length, run: () => void closeTabsById(tabIdsRightOf(tabs, id)) },
      "separator",
      { label: "Reopen closed tab", keys: keyLabel(bindings, "reopenTab"), disabled: !tabs.closed?.length, run: () => changeTabs(reopenTab) },
    ];
  }

  /** Before the first edit of a loaded file: the editor's Markdown for it must render like the file. */
  /** `remember`: the check is of the file's own text, so it isn't repeated until the file changes. */
  const verifyEditable =
    (file: string, original: Doc, remember = true) =>
    async (markdown: string) => {
      const { html } = await renderDoc(markdown, dirname(file), convertFileSrc(""));
      if (!sameRendering(original.html, html)) return EDIT_BLOCKED;
      if (remember) verified.current.add(file);
      return undefined;
    };

  const go = (step: number) => changeTabs((s) => goInTab(s, step));

  /** Opens the find bar, or focuses it again; a one-line selection becomes the query. */
  function openFind() {
    if (!doc) return;
    const selected = getSelection()?.toString().trim() ?? "";
    const seed = selected && !selected.includes("\n") && selected.length <= 200 ? selected : undefined;
    setFind((f) => ({ open: true, query: seed ?? f.query, focusKey: f.focusKey + 1 }));
  }

  /** Image files dropped on a document being edited are inserted at the cursor; false when nothing is edited. */
  function dropImages(files: string[]) {
    const s = session.current;
    if (!editorReady || !s || !("insertImage" in s) || !path) return false;
    const doc = path;
    void placeImages(doc, files).then((placed) =>
      placed.forEach((f) => {
        const image = imageRef(doc, f);
        s.insertImage(image.src, image.alt);
      }),
    );
    return true;
  }

  const closeFind = useCallback(() => setFind((f) => ({ ...f, open: false })), []);

  function togglePin(path: string) {
    setPinned((p) => {
      const next = p.includes(path) ? p.filter((x) => x !== path) : [...p, path];
      save("pinned", next);
      return next;
    });
  }

  /** Distraction-free mode hides toolbar, outline and status bar while a document is shown. */
  function setFocus(on: boolean) {
    setFocusMode(on && !!tab);
    if (on) setShowSettings(false);
  }

  function runShortcut(action: Action) {
    const actions: Record<Action, () => void> = {
      open: pick,
      find: openFind,
      closeTab: () => tab && closeTabById(tab.id),
      reopenTab: () => changeTabs(reopenTab),
      nextTab: () => changeTabs((s) => cycle(s, 1)),
      previousTab: () => changeTabs((s) => cycle(s, -1)),
      back: () => go(-1),
      forward: () => go(1),
      toggleEdit: () => void toggleEdit(),
      preview: () => void togglePreview(),
      source: () => void toggleSource(),
      save: () => path && void saveDoc(path),
      saveAs: () => void saveAs(),
      toggleFocus: () => setFocus(!focusMode),
      exitFocus: () => setFocus(false),
    };
    actions[action]();
  }

  // Window-level listeners are registered once; they call the latest handlers through this ref.
  const state = { focusMode, findOpen: find.open, settingsOpen: showSettings || showAppSettings };
  const bindings = prefs.shortcuts;
  /** A tooltip with the action's current keys after it. */
  const tip = (label: string, id: ShortcutId) => withKeys(label, bindings, id);
  const focusKey = keyLabel(bindings, "toggleFocus");
  const latest = useRef({ openPath, openWhatsNew, reloadSoon, runShortcut, state, bindings, writeDoc, confirmWindowClose, changedOnDisk, dropImages, largeOpen: !!large });
  latest.current = { openPath, openWhatsNew, reloadSoon, runShortcut, state, bindings, writeDoc, confirmWindowClose, changedOnDisk, dropImages, largeOpen: !!large };

  useEffect(() => {
    // The first launch after an update opens What's new; a file passed on the command line opens after it.
    Promise.all([getVersion(), invoke<string | null>("initial_file")])
      .then(async ([current, p]) => {
        setVersion(current);
        const previous = loadLastVersion();
        save("lastVersion", current);
        if (showAfterUpdate(previous, current)) await latest.current.openWhatsNew(current);
        if (p) latest.current.openPath(p);
      })
      .finally(() => setStarted(true));
    const unlisteners = [
      listen<string>("open-file", (e) => latest.current.openPath(e.payload)),
      listen<string>("doc-changed", (e) => latest.current.reloadSoon(e.payload)),
      getCurrentWebview().onDragDropEvent((e) => {
        const { type } = e.payload;
        setDragging(type === "enter" || type === "over");
        if (type !== "drop") return;
        const images = e.payload.paths.filter((p) => IMAGE_FILE.test(p));
        if (images.length && latest.current.dropImages(images)) return;
        const path = e.payload.paths.find((p) => MD.test(p));
        if (path) latest.current.openPath(path);
      }),
      // Unsaved edits are saved before the window closes; if that fails, the user decides.
      getCurrentWindow().onCloseRequested(async (e) => {
        if (!(await latest.current.confirmWindowClose())) e.preventDefault();
      }),
    ];
    const onKey = (e: KeyboardEvent) => {
      // A key the editor used for one of its shortcuts is not the window's too.
      if (e.defaultPrevented) return;
      // The large view takes the keys while it is open.
      if (latest.current.largeOpen) return;
      const action = shortcut(e, latest.current.bindings, latest.current.state);
      if (!action) return;
      e.preventDefault();
      latest.current.runShortcut(action);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      unlisteners.forEach((u) => u.then((off) => off()));
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  // Tabs restored from the last session, and history entries, load when they are first shown.
  useEffect(() => {
    if (!path || docs[path] || loadErrors[path]) return;
    loadShared(path).then(
      (d) => d.path !== path && setTabs((s) => renamePath(s, path, d.path)),
      (e) => setLoadErrors((all) => ({ ...all, [path]: String(e) })),
    );
  }, [path, docs, loadErrors]);

  // Keep only the documents a tab shows; remember the tabs for the next launch.
  useEffect(() => {
    const shown = new Set(openPaths(tabs));
    setDocs((all) => {
      const kept = Object.entries(all).filter(([p]) => shown.has(p));
      return kept.length === Object.keys(all).length ? all : Object.fromEntries(kept);
    });
    const open = (ids: number[]) => (ids.every((id) => tabs.tabs.some((t) => t.id === id)) ? ids : ids.filter((id) => tabs.tabs.some((t) => t.id === id)));
    setEditingTabs(open);
    setSourceTabs(open);
    save("tabs", toStored(tabs));
  }, [tabs]);

  // The title names the document once it is rendered; while it loads the window is just "Octavo".
  // npm run perf relies on this to time launch → rendered.
  const titlePath = doc ? path : undefined;
  useEffect(() => {
    getCurrentWindow().setTitle(titlePath ? `${basename(titlePath)} — Octavo` : "Octavo");
  }, [titlePath]);

  // The window starts hidden (tauri.conf.json) and is shown once the UI has rendered, so it never appears
  // blank; with a file to open, it starts on the loading screen instead of the home screen. Its own
  // background follows the theme, for the moment a resize uncovers it.
  useEffect(() => {
    const window = getCurrentWindow();
    const color = appRoot.current && getComputedStyle(appRoot.current).getPropertyValue("--chrome").trim();
    if (color) window.setBackgroundColor(color).catch(() => {});
    if (started && !windowShown.current) {
      windowShown.current = true;
      window.show().catch(() => {});
    }
  }, [dark, started]);

  // The home screen always shows the toolbar.
  useEffect(() => {
    if (!tab) setFocusMode(false);
  }, [tab]);

  // The open documents are watched for changes on disk.
  const watched = openPaths(tabs).join("\n");
  useEffect(() => {
    invoke("watch_docs", { paths: watched ? watched.split("\n") : [] }).catch(() => {});
  }, [watched]);

  // Column widths set by hand apply, and tables and code blocks wider than the text column grow beside it.
  // This runs before the scroll position is restored, since it changes how tall the document is, and the
  // widening again when the reading area's width changes.
  useLayoutEffect(() => {
    const root = article.current;
    const area = scroller.current;
    const file = doc?.path;
    if (!root || !area || !file || editing || shownHtml === undefined) return;
    const tables = [...root.querySelectorAll("table")];
    tables.forEach((table, i) => {
      const widths = savedWidths(tableWidths.current, file, i, headersOf(table));
      if (widths) applyWidths(table, widths);
    });
    const stopResizing = addResizeHandles(root, (table, widths) => {
      tableWidths.current = withWidths(tableWidths.current, file, tables.indexOf(table), headersOf(table), widths);
      save("tableWidths", tableWidths.current);
      widenBlocks(root, area, prefs.wideBlocks);
    });
    widenBlocks(root, area, prefs.wideBlocks);
    let widths = `${area.clientWidth}:${root.clientWidth}`;
    const observer = new ResizeObserver(() => {
      const next = `${area.clientWidth}:${root.clientWidth}`;
      if (next === widths) return;
      widths = next;
      widenBlocks(root, area, prefs.wideBlocks);
    });
    observer.observe(area);
    observer.observe(root);
    return () => {
      observer.disconnect();
      stopResizing();
    };
  }, [shownHtml, editing, dark, doc?.path, prefs.size, prefs.font, prefs.width, prefs.wideBlocks]);

  // Buttons that open tables, and with the reading settings' option diagrams and images, large. Added again once
  // the diagrams are drawn, since they come after the rest of the document.
  useLayoutEffect(() => {
    const root = article.current;
    if (!root || editing || shownHtml === undefined) return;
    return addOpenButtons(root, prefs.openLarge !== "click");
  }, [shownHtml, editing, rendered, prefs.openLarge]);

  // Back in a tab, or switching tabs, returns to where that document was scrolled to.
  const entryKey = tab && doc ? `${tab.id}:${tab.index}:${doc.path}` : undefined;
  useLayoutEffect(() => {
    if (tab && entryKey) scroller.current?.scrollTo(0, currentEntry(tab).scroll);
    tabStrip.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [entryKey]);

  // After switching between reading and editing, the reading view returns to the same place.
  useLayoutEffect(() => {
    if (!editing && !source && shownHtml) restoreAnchor();
  }, [editing, source, shownHtml]);

  // The editor replaces the reading view once it has loaded, at the same place.
  useLayoutEffect(() => {
    if (!editorReady || !editorShown) return;
    article.current = editorShown.root;
    restoreAnchor();
  }, [editorReady, editorShown]);

  // A reloaded document stays where it was scrolled to, also after its diagrams are drawn again.
  useLayoutEffect(() => {
    if (keepScroll.current !== undefined) scroller.current?.scrollTo(0, keepScroll.current);
  }, [doc]);

  // After each render of the document (new file, reload, edits or theme switch): diagrams, outline, word count.
  useEffect(() => {
    const root = article.current;
    if (!doc || !root) return;
    if (editing) {
      // The editor's headings have no ids; the outline finds them by position while editing.
      const found = [...root.querySelectorAll<HTMLElement>("h1, h2, h3, h4")];
      if (editorReady) setHeadings(found.map((h, i) => ({ id: `editor-heading-${i}`, text: h.textContent ?? "", level: Number(h.tagName[1]) })));
      return;
    }
    const stopWatchingImages = watchBrokenImages(root);
    renderMermaid(root, dark).finally(() => {
      if (keepScroll.current !== undefined) scroller.current?.scrollTo(0, keepScroll.current);
      keepScroll.current = undefined;
      setRendered((n) => n + 1);
    });
    const found = [...root.querySelectorAll<HTMLElement>("h1[id], h2[id], h3[id], h4[id]")];
    setHeadings(found.map((h) => ({ id: h.id, text: h.textContent ?? "", level: Number(h.tagName[1]) })));
    setActiveId(found[0]?.id);
    const properties = root.querySelector(".doc-properties, .doc-properties-yaml")?.textContent ?? "";
    setWords((root.textContent ?? "").slice(properties.length).split(/\s+/).filter(Boolean).length);
    return stopWatchingImages;
  }, [doc, shownHtml, dark, editing, editorReady]);

  // The scroll position is saved shortly after scrolling stops, so it survives a restart.
  const scrollSave = useRef<number>(undefined);
  const saveScrollSoon = () => {
    clearTimeout(scrollSave.current);
    scrollSave.current = window.setTimeout(() => {
      const top = scroller.current?.scrollTop;
      if (top !== undefined) setTabs((s) => (s.active === undefined ? s : setScroll(s, s.active, top)));
    }, 400);
  };

  // The outline highlights the last heading that has scrolled past the top of the reading area.
  const onScroll = useCallback(() => {
    saveScrollSoon();
    const main = scroller.current;
    if (!main || !headings.length) return;
    const top = main.getBoundingClientRect().top + 96;
    let current = headings[0].id;
    for (const h of headings) {
      const el = document.getElementById(h.id);
      if (el && el.getBoundingClientRect().top <= top) current = h.id;
      else break;
    }
    setActiveId(current);
  }, [headings]);

  // The large view closes when another document is shown.
  useEffect(() => setLarge(undefined), [path, tab?.id]);

  // Links never navigate the webview: fragments scroll, URLs go to the browser, .md links open here. An open button
  // opens its table, diagram or image large; so does a click on a diagram or an image that isn't a link, when the
  // reading settings say so.
  function onDocClick(e: React.MouseEvent) {
    const copy = (e.target as HTMLElement).closest<HTMLButtonElement>(".code-copy");
    if (copy) {
      const code = copy.closest(".code-block")?.querySelector("pre")?.textContent ?? "";
      navigator.clipboard.writeText(code).then(
        () => (copy.textContent = "Copied"),
        () => (copy.textContent = "Copy failed"),
      );
      setTimeout(() => (copy.textContent = "Copy"), 1500);
      return;
    }
    const opened = article.current && largeContent(e.target as Element, article.current, {
        editing,
        selecting: window.getSelection()?.isCollapsed === false,
        click: prefs.openLarge !== "button",
      });
    if (opened) {
      e.preventDefault();
      setLarge(opened);
      return;
    }
    const href = (e.target as HTMLElement).closest("a")?.getAttribute("href");
    if (!href || !doc) return;
    e.preventDefault();
    followLink(href);
  }

  /** Fragments scroll, URLs go to the browser, .md links open here. */
  function followLink(href: string) {
    if (!doc) return;
    if (href.startsWith("#")) {
      document.getElementById(safeDecode(href.slice(1)))?.scrollIntoView();
    } else if (/^(https?|mailto):/i.test(href)) {
      openUrl(href);
    } else {
      const file = safeDecode(href.split("#")[0]);
      if (MD.test(file)) openPath(joinPath(dirname(doc.path), file), tab?.id);
    }
  }

  const layout = editorLayout(prefs);
  const unsavedAt = (p: string) =>
    !!drafts[p] || conflicts[p] !== undefined || saveStates[p]?.state === "unsaved" || saveStates[p]?.state === "error";
  const inSession = !!path && originals[path] !== undefined;
  const docActions: DocActions | undefined = path
    ? {
        unsaved: unsavedAt(path),
        save: () => void saveDoc(path),
        saveAs: () => void saveAs(),
        canRevert: canRevert({ original: originals[path], onDisk: doc?.text ?? "", unsaved: unsavedAt(path) }),
        revert: () => void revertToOriginal(path),
      }
    : undefined;
  const saveStatus =
    path && conflicts[path] !== undefined ? (
      <span className="save-state" data-state="error">
        Changed on disk
      </span>
    ) : saveState?.state === "unsaved" || saveState?.state === "error" ? (
      <button
        className="save-state"
        data-state={saveState.state}
        title={saveState.state === "error" ? `${saveState.message} Click to try again.` : tip("Save now", "save")}
        onClick={() => void saveDoc(path!)}
      >
        {SAVE_LABELS[saveState.state]}
      </button>
    ) : (
      <span className="save-state" data-state={saveState?.state}>
        {saveState ? SAVE_LABELS[saveState.state] : editing || source ? "Editing" : "Reading"}
      </span>
    );

  const rootStyle = { "--doc-size": `${prefs.size}px`, "--doc-width": WIDTHS[prefs.width] } as CSSProperties;

  const updateReady = updates.status.state === "ready" || updates.status.state === "installing" ? updates.status : undefined;

  const view = (
    <div
      ref={appRoot}
      className="app"
      data-theme={dark ? "dark" : "light"}
      data-font={prefs.font}
      data-hide-properties={!prefs.properties || undefined}
      data-focus={focusMode || undefined}
      style={rootStyle}
    >
      <header className="toolbar">
        {tabs.tabs.length ? (
          <>
            <button className="icon-btn" aria-label="Home" aria-pressed={!tab} onClick={() => changeTabs(goHome)}>
              <Icon name="home" />
            </button>
            {tab && (
              <button
                className="icon-btn"
                aria-label="Show outline"
                aria-pressed={prefs.outline}
                onClick={() => changePrefs({ ...prefs, outline: !prefs.outline })}
              >
                <Icon name="sidebar" />
              </button>
            )}
            <button className="icon-btn" aria-label={tip("Back", "back")} disabled={!tab || !historyTarget(tabs, -1)} onClick={() => go(-1)}>
              <Icon name="back" />
            </button>
            <button className="icon-btn" aria-label={tip("Forward", "forward")} disabled={!tab || !historyTarget(tabs, 1)} onClick={() => go(1)}>
              <Icon name="forward" />
            </button>
            <nav className="tabs" aria-label="Open documents" ref={tabStrip}>
              {tabs.tabs.map((t) => {
                const tabPath = currentEntry(t).path;
                return (
                  <div
                    key={t.id}
                    className="tab"
                    title={tabPath}
                    data-tab-id={t.id}
                    data-dragging={draggedTab === t.id || undefined}
                    data-menu={tabMenu?.id === t.id || undefined}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setTabMenu({ id: t.id, x: e.clientX, y: e.clientY });
                    }}
                    aria-current={t.id === tab?.id ? "page" : undefined}
                    onMouseDown={(e) => {
                      if (e.button === 1) e.preventDefault();
                    }}
                    onPointerDown={(e) => e.button === 0 && !(e.target as HTMLElement).closest(".icon-btn") && startTabDrag(e, t.id)}
                    onAuxClick={(e) => e.button === 1 && closeTabById(t.id)}
                  >
                    <button className="tab-open" onClick={() => changeTabs((s) => activate(s, t.id))}>
                      {unsavedAt(tabPath) ? <span className="unsaved-dot" title="Unsaved changes" /> : <Icon name="file" size={14} />}
                      <span>{basename(tabPath)}</span>
                    </button>
                    <button className="icon-btn small" aria-label={tip(`Close ${basename(tabPath)}`, "closeTab")} onClick={() => closeTabById(t.id)}>
                      <Icon name="close" size={13} />
                    </button>
                  </div>
                );
              })}
              <button className="icon-btn" aria-label={tip("Open file", "open")} onClick={pick}>
                <Icon name="plus" />
              </button>
            </nav>
          </>
        ) : (
          <span className="brand">Octavo</span>
        )}
        <span className="spacer" />
        {editing && layout.status === "toolbar" && <span className="toolbar-status">{saveStatus}</span>}
        {inSession && (!editing || !layout.actionsInBar) && docActions && <DocButtons doc={docActions} />}
        {tab && inSession && (
          <div className="mode-switch" role="group" aria-label="Editing mode">
            <button
              aria-pressed={editing}
              disabled={!!path && !!editBlocked[path]}
              title={path && editBlocked[path] ? editBlocked[path] : "Edit the document"}
              onClick={() => void setMode("edit")}
            >
              <Icon name="pencil" size={14} />
              Edit
            </button>
            <button aria-pressed={source} title={tip("Source: the document's Markdown", "source")} onClick={() => void setMode("source")}>
              <Icon name="code" size={14} />
              Source
            </button>
            <button aria-pressed={!editing && !source} title={tip("Preview: the reading view of your edits", "preview")} onClick={() => void setMode("preview")}>
              <Icon name="preview" size={14} />
              Preview
            </button>
          </div>
        )}
        {tab && inSession && (
          <button className="done-btn" title={tip("Done: save and stop editing", "toggleEdit")} onClick={() => void toggleEdit()}>
            <Icon name="check" size={14} />
            Done
          </button>
        )}
        {tab && !inSession && (
          <button
            className="edit-btn"
            disabled={!doc}
            title={tip(path && editBlocked[path] ? "Edit the Markdown source" : "Edit", "toggleEdit")}
            onClick={() => void toggleEdit()}
          >
            <Icon name="pencil" size={14} />
            Edit
          </button>
        )}
        {tab && <span className="toolbar-sep wide" />}
        {tab && (
          <button className="icon-btn" aria-label={tip("Find in document", "find")} aria-expanded={find.open} onClick={openFind}>
            <Icon name="search" />
          </button>
        )}
        {updates.offered && (
          <button className="update-btn" data-update-toggle aria-expanded={showUpdate} onClick={() => setShowUpdate((s) => !s)}>
            <span className="unsaved-dot" />
            Update ready
          </button>
        )}
        <button
          className="icon-btn"
          data-settings-toggle
          aria-label="Reading settings"
          aria-expanded={showSettings}
          onClick={() => setShowSettings((s) => !s)}
        >
          <Icon name="type" />
        </button>
        <button className="icon-btn" aria-label="Settings" aria-expanded={showAppSettings} onClick={() => setShowAppSettings(true)}>
          <Icon name="settings" />
        </button>
      </header>
      {editing && <div className="format-slot" ref={setFormatSlot} />}

      <div className="body">
        {tab ? (
          <>
            {prefs.outline && doc && (
              <aside className="sidebar" aria-label="Outline">
                <div className="sidebar-head">
                  <span className="section-label">Outline</span>
                  <span className="count">{headings.length}</span>
                </div>
                <nav className="outline">
                  {headings.length === 0 && <p className="muted">No headings</p>}
                  {headings.map((h, i) => (
                    <a
                      key={h.id}
                      href={`#${h.id}`}
                      data-level={h.level}
                      aria-current={h.id === activeId ? "location" : undefined}
                      onClick={(e) => {
                        e.preventDefault();
                        if (source) return sourceEditor.current?.reveal(sourceHeadingStarts.current[i]);
                        // The editor's headings have no ids; they are in the same order.
                        const target = editing
                          ? article.current?.querySelectorAll("h1, h2, h3, h4")[i]
                          : document.getElementById(h.id);
                        target?.scrollIntoView();
                      }}
                    >
                      {h.text}
                    </a>
                  ))}
                </nav>
              </aside>
            )}
            <main className="reader" ref={scroller} onScroll={onScroll}>
              {(error ?? (path && loadErrors[path])) && <p className="error banner">{error ?? (path && loadErrors[path])}</p>}
              {path && editBlocked[path] && <p className="notice banner">{editBlocked[path]}</p>}
              {path && conflicts[path] !== undefined ? (
                <div className="banner conflict" role="alert">
                  <Icon name="warning" />
                  <span className="conflict-text">
                    <strong>{basename(path)} changed on disk.</strong> Your unsaved edits are kept here; nothing was saved.
                  </span>
                  <span className="conflict-actions">
                    <button className="text-btn primary" onClick={() => openCompare(path)}>
                      Compare
                    </button>
                    <button className="text-btn" title="Drop your unsaved edits and show the file as it is on disk" onClick={() => reloadFromDisk(path)}>
                      Reload from disk
                    </button>
                    <button className="text-btn" title="Write your edits over the file on disk" onClick={() => keepMine(path)}>
                      Keep my version
                    </button>
                  </span>
                </div>
              ) : (
                saveState?.message && <p className="error banner">{saveState.message}</p>
              )}
              {doc && path && (
                <div className="doc-column">
                  <div className="breadcrumb" title={doc.path}>
                    {folderTrail(doc.path)} › {basename(doc.path)}
                  </div>
                  {source && (
                    <SourcePane
                      key={`${editorKey}:source`}
                      markdown={draft?.text ?? editorText(doc.text)}
                      onReady={(editor) => {
                        editBase.current = { path, base: draft?.base ?? doc.text };
                        session.current = editor.session;
                        sourceEditor.current = editor;
                        showSourceHeadings();
                        // The source opens where the view was.
                        requestAnimationFrame(restoreAnchor);
                      }}
                      onChange={() => {
                        setSaveState(path, { state: "unsaved" });
                        saveSoon(path);
                        clearTimeout(sourceOutline.current);
                        sourceOutline.current = window.setTimeout(showSourceHeadings, 300);
                      }}
                      onLeave={(editor) => {
                        clearTimeout(sourceOutline.current);
                        if (sourceEditor.current === editor) sourceEditor.current = undefined;
                        keepEdits(path, editor.session);
                      }}
                    />
                  )}
                  {!editorReady && !source && shownHtml !== undefined && (
                    <article
                      key={`${doc.path}:${dark}:${draft ? "draft" : "file"}`}
                      className="doc"
                      data-click-large={prefs.openLarge !== "button" || undefined}
                      ref={article}
                      onClick={onDocClick}
                      dangerouslySetInnerHTML={{ __html: shownHtml }}
                    />
                  )}
                  {editing && (
                    <EditorPane
                      key={editorKey}
                      markdown={draft?.text ?? editorText(doc.text)}
                      imageUrl={(src) => resolveLocal(dirname(path), src, convertFileSrc)}
                      verify={
                        draft?.source
                          ? verifyEditable(path, { ...doc, html: draft.html ?? "" }, false)
                          : draft || verified.current.has(path)
                            ? undefined
                            : verifyEditable(path, doc)
                      }
                      formatSlot={formatSlot}
                      formatAlign={prefs.formatBarAlign}
                      layout={layout}
                      tableSide={prefs.tableBar === "side"}
                      status={saveStatus}
                      onOpenLink={followLink}
                      onPickImage={async () => {
                        const file = await openDialog({ defaultPath: dirname(path), filters: [{ name: "Images", extensions: IMAGE_TYPES }] });
                        if (typeof file !== "string") return undefined;
                        const [placed] = await placeImages(path, [file]);
                        return placed ? imageRef(path, placed) : undefined;
                      }}
                      onPasteImages={async (files) => {
                        const saved: { src: string; alt: string }[] = [];
                        for (const file of files) {
                          const name = pastedName(file, new Date());
                          if (!name) continue;
                          const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
                          await invoke<string>("save_image", { dir: dirname(path), name, bytes }).then(
                            (full) => saved.push(imageRef(path, full)),
                            (e) => message(`The image couldn't be saved: ${e}`, { kind: "error" }),
                          );
                        }
                        return saved;
                      }}
                      docActions={docActions!}
                      onStart={() => (editBase.current = { path, base: draft?.base ?? doc.text })}
                      onReady={(s, root) => {
                        session.current = s;
                        // The editor opens where the reading view is now.
                        if (article.current?.isConnected) pendingAnchor.current = currentAnchor();
                        setEditorShown({ key: editorKey!, root });
                      }}
                      onBlocked={(message) => {
                        setEditBlocked((all) => ({ ...all, [path]: message }));
                        // The edit session goes on in Source mode.
                        const id = tab.id;
                        setEditingTabs((t) => t.filter((x) => x !== id));
                        setSourceTabs((t) => [...t.filter((x) => x !== id), id]);
                      }}
                      onChange={() => {
                        setSaveState(path, { state: "unsaved" });
                        saveSoon(path);
                      }}
                      onLeave={(s) => {
                        setEditorShown(undefined);
                        keepEdits(path, s);
                      }}
                    />
                  )}
                </div>
              )}
            </main>
            {find.open && doc && (
              <FindBar
                query={find.query}
                onQuery={(query) => setFind((f) => ({ ...f, query }))}
                root={article}
                scroller={scroller}
                content={rendered}
                focusKey={find.focusKey}
                onClose={closeFind}
              />
            )}
            {compare && (
              <CompareView
                name={basename(compare.file)}
                disk={compare.disk}
                mine={compare.mine}
                onReload={() => reloadFromDisk(compare.file)}
                onKeep={() => keepMine(compare.file)}
                onClose={() => setCompare(undefined)}
              />
            )}
            {dragging && <div className="drop-overlay">{editorReady ? "Drop an image to insert it, or a document to open it" : "Drop to open"}</div>}
          </>
        ) : (
          <Home
            recent={recent}
            pinned={pinned}
            dragging={dragging}
            error={error}
            onPick={pick}
            onOpen={(p) => openPath(p)}
            onTogglePin={togglePin}
          />
        )}
        {(opening.length > 0 || (path && !doc && !loadErrors[path])) && (
          <div className="loading" data-solid={!tab || undefined} role="status">
            <span className="spinner" aria-hidden="true" />
            <span>Opening {basename(opening[opening.length - 1] ?? path ?? "")}…</span>
          </div>
        )}
        {focusMode && (
          <p className="focus-hint" role="status">
            Press {focusKey && <><kbd>{focusKey}</kbd> or </>}<kbd>Esc</kbd> to show the toolbar
          </p>
        )}
        {showAppSettings && (
          <Settings
            prefs={prefs}
            onChange={changePrefs}
            onClose={() => setShowAppSettings(false)}
            version={version}
            update={updates.status}
            onCheckUpdate={updates.checkNow}
            onRestart={() => void restartToUpdate()}
            onWhatsNew={() => {
              setShowAppSettings(false);
              void openWhatsNew(version);
            }}
          />
        )}
        {tabMenu && tabs.tabs.some((t) => t.id === tabMenu.id) && (
          <TabMenu
            name={basename(currentEntry(tabs.tabs.find((t) => t.id === tabMenu.id)!).path)}
            x={tabMenu.x}
            y={tabMenu.y}
            items={tabMenuItems(tabMenu.id)}
            onClose={closeTabMenu}
          />
        )}
        {showUpdate && updates.offered && updateReady && (
          <UpdatePopover
            version={updateReady.version}
            installing={updateReady.state === "installing"}
            onRestart={() => void restartToUpdate()}
            onLater={() => {
              updates.dismiss();
              setShowUpdate(false);
            }}
            notesInApp={!!updates.notes}
            onWhatsNew={() => {
              setShowUpdate(false);
              if (updates.notes) void openWhatsNew(updateReady.version, updates.notes, updates.date);
              else void openUrl(releaseUrl(updateReady.version));
            }}
            onClose={() => setShowUpdate(false)}
          />
        )}
        {showSettings && (
          <ReadingSettings
            prefs={prefs}
            onChange={changePrefs}
            focusMode={focusMode}
            onFocusMode={tab ? setFocus : undefined}
            onClose={() => setShowSettings(false)}
          />
        )}
      </div>

      <footer className="statusbar">
        {doc ? (
          <>
            <span>
              {words.toLocaleString()} words · {Math.max(1, Math.round(words / 230))} min read
            </span>
            <span className="status-right">
              {(!editing || layout.status === "status") && saveStatus}
              <span>UTF-8</span>
              <span>{doc.text.includes("\r\n") ? "CRLF" : "LF"}</span>
              <span>Markdown</span>
            </span>
          </>
        ) : (
          <>
            <span>Octavo {version}</span>
            <span>No document open</span>
          </>
        )}
      </footer>
      {large && <LargeViewer content={large} onClose={() => setLarge(undefined)} />}
    </div>
  );

  return <KeysContext.Provider value={bindings}>{view}</KeysContext.Provider>;
}
