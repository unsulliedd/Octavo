import type { RefObject } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import type { DocActions } from "@/editor/FormatBar";
import { sameRendering } from "@/editor/sameRendering";
import type { EditorSession, Snapshot } from "@/editor/session";
import { basename, dirname, relativePath, resolveLocal } from "@/lib/paths";
import type { Anchor } from "@/reading/scrollAnchor";
import { renderDoc } from "@/reading/renderDoc";
import type { Prefs } from "@/settings/storage";
import type { SourceEditor } from "@/source/sourceEditor";
import type { SourceSession, SourceSnapshot } from "@/source/sourceSession";
import { closeTab, currentEntry, replaceCurrent, samePath, tabFor, type Tab, type Tabs } from "@/tabs/tabs";
import { ask, choose, message } from "@/ui/dialog";
import { diskChange } from "./conflict";
import { checkKey, passedBefore, rememberPassed } from "./editChecks";
import { canRevert, revertText } from "./editSession";
import { toggleTask } from "@/reading/taskBoxes";
import { editedText, editorText, textToSave } from "./fileText";
import { IMAGE_TYPES, pastedName } from "./images";
import type { Doc } from "./useDocuments";
import type { Draft, EditState, Mode } from "./useEditState";

/** Edits are saved this long after the last change. */
const AUTOSAVE_DELAY = 1000;

const CHANGED_ON_DISK = "the file changed on disk while it had unsaved edits.";

const NOT_EXACT_PROBLEM = "the editor can't write part of this document as Markdown that opens the same way again. Nothing was written;";
const NOT_EXACT = `${NOT_EXACT_PROBLEM} undo or change the last edit and save again.`;
/** After Done the undo history is gone: the edits are kept and go back to the editor with Edit. */
const NOT_EXACT_AFTER_DONE = `${NOT_EXACT_PROBLEM} press Edit, then change the last edit or revert to the original.`;

const EDIT_BLOCKED =
  "The editor would change how parts of this document look when it saves, so it opens in Source mode: edit its Markdown as text.";

/**
 * The image files a document links for `files`: files in its repository (or folder) as they are, others copied
 * into its image folder, so the links still work after a commit. Empty, after saying why, when that fails.
 */
const placeImages = (doc: string, files: string[]) =>
  invoke<string[]>("place_images", { dir: dirname(doc), paths: files }).catch(async (e) => {
    await message(`The image couldn't be added: ${e}`);
    return [] as string[];
  });

/** An image file as the document links it: its path relative to the document, and its name as alt text. */
const imageRef = (doc: string, file: string) => ({ src: relativePath(dirname(doc), file), alt: basename(file).replace(/\.[^.]+$/, "") });

async function renderDraft(file: string, text: string) {
  const { html, math } = await renderDoc(text, dirname(file), convertFileSrc(""));
  if (math) await import("katex/dist/katex.min.css");
  return html;
}

type Context = {
  edit: EditState;
  docs: Record<string, Doc>;
  setDocs: (fn: (all: Record<string, Doc>) => Record<string, Doc>) => void;
  load: (path: string) => Promise<Doc>;
  verified: RefObject<Set<string>>;
  addRecent: (file: string) => void;
  setError: (error: string | undefined) => void;
  tabs: Tabs;
  tab: Tab | undefined;
  changeTabs: (fn: (s: Tabs) => Tabs) => void;
  path: string | undefined;
  doc: Doc | undefined;
  editing: boolean;
  source: boolean;
  editorReady: boolean;
  /** The key of the editor pane that shows `path`. */
  editorKey: string | undefined;
  prefs: Prefs;
  article: RefObject<HTMLElement | null>;
  currentAnchor: () => Anchor;
  pendingAnchor: RefObject<Anchor | undefined>;
  restoreAnchor: () => void;
  showSourceHeadings: () => void;
  /** Reads a document again after a change on disk. */
  reloadSoon: (file: string) => void;
  /** Keeps the reading view where it is scrolled to through the next render of the shown document. */
  holdScroll: () => void;
  /** The latest render's writeDoc and writeTick, which the save queue calls. */
  latest: RefObject<{
    writeDoc: (file: string, target?: string) => Promise<string | undefined>;
    writeTick: (file: string, offset: number) => Promise<string | undefined>;
  }>;
};

/**
 * The edit sessions and saving: modes, drafts, autosave, the save queue, Save As, conflicts, compare, revert,
 * discarding edits and asking to save them. Built again on each render over that render's state; not memoized.
 */
export function editActions(c: Context) {
  const { edit, docs, setDocs, load, verified, addRecent, setError, tabs, tab, changeTabs, path, doc, editing, source, editorReady, prefs } = c;
  const { originalsRef, draftsRef, conflictsRef, autosaves, saveQueue, session, editBase, editBlocked, updateDrafts, setSaveState, updateOriginals, endSession, updateConflicts } = edit;
  const { setEditingTabs, setSourceTabs, setSaveStates, setCompare, setEditorLoads, setEditBlocked } = edit;

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
    c.pendingAnchor.current = c.currentAnchor();
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
    const run = saveQueue.current.then(() => c.latest.current.writeDoc(file, target));
    saveQueue.current = run.catch(() => undefined);
    return run;
  }

  /**
   * Writes the edits to `file`, or the document to `target` (Save As). Nothing is written when there are no
   * edits or they leave the file as it is, when the editor's Markdown would not open as what was edited,
   * or when the file no longer holds the text the edits were made to. A draft is written even when no tab
   * shows its document now; it carries the text it was made to, which the file is checked against.
   */
  async function writeDoc(file: string, target?: string): Promise<string | undefined> {
    const doc = docs[file];
    if (!doc && !draftsRef.current[file]) return undefined;
    const other = target !== undefined && !samePath(target, file);
    if (!other && conflictsRef.current[file] !== undefined) return CHANGED_ON_DISK;
    const s = sessionFor(file);
    const snapshot = s?.edited() ? s.snapshot(baseFor(file)) : undefined;
    const draft = draftsRef.current[file];
    const edited = snapshot?.markdown ?? draft?.text;
    const base = edited === undefined ? doc!.text : baseFor(file);
    if (edited === undefined && !other) {
      setSaveStates((all) => (all[file] ? { ...all, [file]: { state: "saved" } } : all));
      return undefined;
    }
    const fail = (message: string, refused?: boolean) => {
      setSaveState(target ?? file, { state: "error", message: `Couldn't save ${basename(target ?? file)}: ${message}`, refused });
      return message;
    };
    if (edited !== undefined && !(snapshot ? snapshot.exact : draft?.exact)) return fail(originalsRef.current[file] === undefined ? NOT_EXACT_AFTER_DONE : NOT_EXACT, true);
    const text = other ? (edited === undefined ? base : editedText(base, edited)) : textToSave(base, edited);
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
        // A document no tab shows isn't kept.
        setDocs((all) => (file in all ? { ...all, [file]: { path: file, text: written, html } } : all));
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
      addRecent(d.path);
    } catch (e) {
      setError(String(e));
    }
    return undefined;
  }

  /**
   * Ticks or unticks the task box that starts at `offset` in `file` and writes the file at once, after any
   * save already running. Resolves to an error message when nothing was written.
   */
  function tickTask(file: string, offset: number): Promise<string | undefined> {
    const run = saveQueue.current.then(() => c.latest.current.writeTick(file, offset));
    saveQueue.current = run.catch(() => undefined);
    return run;
  }

  /**
   * Writes `file` with one task box ticked or unticked: one character changes. Nothing is written while the file
   * has an edit session or unsaved edits. When the text at `offset` is no task box, or the file no longer holds
   * the text shown, nothing is written and the file is read again.
   */
  async function writeTick(file: string, offset: number): Promise<string | undefined> {
    const doc = docs[file];
    if (!doc || !edit.canTick(file)) return "the document has an edit session or unsaved edits.";
    const text = toggleTask(doc.text, offset);
    try {
      if (text === undefined) throw "the document changed since it was shown. It was read again.";
      await invoke<boolean>("save_doc", { path: file, text, expected: doc.text, backup: prefs.backups });
    } catch (e) {
      setError(`Couldn't save ${basename(file)}: ${e}`);
      c.reloadSoon(file);
      return String(e);
    }
    const { html } = await renderDoc(text, dirname(file), convertFileSrc(""));
    verified.current.delete(file);
    setError(undefined);
    if (file === path) c.holdScroll();
    setDocs((all) => (file in all ? { ...all, [file]: { path: file, text, html } } : all));
    return undefined;
  }

  async function saveAs() {
    if (!path || !doc) return;
    const target = await saveDialog({ defaultPath: path, filters: [{ name: "Markdown", extensions: ["md", "markdown"] }] });
    if (typeof target === "string") await saveDoc(path, target);
  }

  /** Every document with unsaved edits. */
  function filesWithEdits() {
    const files = new Set(Object.keys(draftsRef.current));
    const open = editBase.current?.path;
    if (open && sessionFor(open)?.edited()) files.add(open);
    return [...files];
  }

  /**
   * Saves every document with unsaved edits. Resolves to the messages of the saves that failed, each
   * naming its file.
   */
  async function saveAll() {
    const failed: string[] = [];
    for (const file of filesWithEdits()) {
      const message = (await saveDoc(file)) ?? (hasEdits(file) ? "it still has unsaved edits." : undefined);
      if (message) failed.push(`${basename(file)}: ${message}`);
    }
    return failed;
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
      okLabel: "Revert",
      cancelLabel: "Keep editing",
      danger: true,
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
  async function askToSave(names: string, doing = "closing"): Promise<"save" | "discard" | "cancel"> {
    if (prefs.autosave) return "save";
    return choose<"save" | "discard" | "cancel">(
      `Save your changes to ${names} before ${doing}?`,
      [
        { value: "save", label: "Save", look: "primary" },
        { value: "discard", label: "Don't save", look: "danger" },
        { value: "cancel", label: "Cancel" },
      ],
      "cancel",
    );
  }

  /**
   * Before every document is left: saves unsaved edits, or asks. Resolves to whether to go on; a save that
   * failed is then the user's choice, in the words of `anyway` and `okLabel`.
   */
  async function settleEdits(anyway: string, okLabel: string, doing?: string) {
    const files = filesWithEdits();
    if (!files.length) return true;
    const choice = await askToSave(files.map(basename).join(", "), doing);
    if (choice !== "save") return choice === "discard";
    const failed = await saveAll();
    if (!failed.length) return true;
    return ask(`These documents couldn't be saved:\n\n${failed.join("\n")}\n\n${anyway}`, { okLabel, cancelLabel: "Keep open", danger: true });
  }

  /** Before the window closes: resolves to whether it may. */
  const confirmWindowClose = () => settleEdits("Close Octavo anyway and lose the unsaved edits?", "Close without saving");

  /**
   * Before the tabs of another workspace, or of none, replace these: resolves to whether they may. When they
   * may, no document has unsaved edits, so nothing kept by path can reach the next tabs. A switch asked for
   * while another is deciding is ignored.
   */
  async function confirmSwitch() {
    if (edit.switching.current) return false;
    edit.switching.current = true;
    try {
      if (!(await settleEdits("Switch anyway and lose the unsaved edits?", "Switch without saving", "switching"))) return false;
      filesWithEdits().forEach(discardEdits);
      return true;
    } finally {
      edit.switching.current = false;
    }
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
          okLabel: "Close without saving",
          cancelLabel: "Keep open",
          danger: true,
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

  /**
   * Before the first edit of a loaded file: the editor's Markdown for it must render like the file. With `remember`,
   * the check is of the file's own text, so it isn't repeated until the file changes, and a pass is kept between
   * launches for that exact text.
   */
  const verifyEditable =
    (file: string, original: Doc, remember = true) =>
    async (markdown: string) => {
      const key = remember ? await checkKey(await getVersion(), file, original.text) : undefined;
      if (!key || !passedBefore(key)) {
        const { html } = await renderDoc(markdown, dirname(file), convertFileSrc(""));
        if (!sameRendering(original.html, html)) return EDIT_BLOCKED;
        if (key) rememberPassed(key);
      }
      if (remember) verified.current.add(file);
      return undefined;
    };

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

  const { unsavedAt } = edit;
  const docActions: DocActions | undefined = path
    ? {
        unsaved: unsavedAt(path),
        save: () => void saveDoc(path),
        saveAs: () => void saveAs(),
        canRevert: canRevert({ original: edit.originals[path], onDisk: doc?.text ?? "", unsaved: unsavedAt(path) }),
        revert: () => void revertToOriginal(path),
      }
    : undefined;

  /** The Source view's props for the shown document `path`, with its draft. */
  const sourcePaneProps = (path: string, doc: Doc, draft: Draft | undefined) => ({
    markdown: draft?.text ?? editorText(doc.text),
    onReady: (editor: SourceEditor) => {
      editBase.current = { path, base: draft?.base ?? doc.text };
      session.current = editor.session;
      edit.sourceEditor.current = editor;
      c.showSourceHeadings();
      // The source opens where the view was.
      requestAnimationFrame(c.restoreAnchor);
    },
    onChange: () => {
      setSaveState(path, { state: "unsaved" });
      saveSoon(path);
      clearTimeout(edit.sourceOutline.current);
      edit.sourceOutline.current = window.setTimeout(c.showSourceHeadings, 300);
    },
    onLeave: (editor: SourceEditor) => {
      clearTimeout(edit.sourceOutline.current);
      if (edit.sourceEditor.current === editor) edit.sourceEditor.current = undefined;
      keepEdits(path, editor.session);
    },
  });

  /** The editor's props for the shown document `path`, with its draft, apart from where and how it is laid out. */
  const editorPaneProps = (path: string, doc: Doc, draft: Draft | undefined) => ({
    markdown: draft?.text ?? editorText(doc.text),
    imageUrl: (src: string) => resolveLocal(dirname(path), src, convertFileSrc),
    verify: draft?.source
      ? verifyEditable(path, { ...doc, html: draft.html ?? "" }, false)
      : draft || verified.current.has(path)
        ? undefined
        : verifyEditable(path, doc),
    onPickImage: async () => {
      const file = await openDialog({ defaultPath: dirname(path), filters: [{ name: "Images", extensions: IMAGE_TYPES }] });
      if (typeof file !== "string") return undefined;
      const [placed] = await placeImages(path, [file]);
      return placed ? imageRef(path, placed) : undefined;
    },
    onPasteImages: async (files: File[]) => {
      const saved: { src: string; alt: string }[] = [];
      for (const file of files) {
        const name = pastedName(file, new Date());
        if (!name) continue;
        const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
        await invoke<string>("save_image", { dir: dirname(path), name, bytes }).then(
          (full) => saved.push(imageRef(path, full)),
          (e) => message(`The image couldn't be saved: ${e}`),
        );
      }
      return saved;
    },
    docActions: docActions!,
    onStart: () => (editBase.current = { path, base: draft?.base ?? doc.text }),
    onReady: (s: EditorSession, root: HTMLElement) => {
      session.current = s;
      // The editor opens where the reading view is now.
      if (c.article.current?.isConnected) c.pendingAnchor.current = c.currentAnchor();
      edit.setEditorShown({ key: c.editorKey!, root });
    },
    onBlocked: (message: string) => {
      setEditBlocked((all) => ({ ...all, [path]: message }));
      // The edit session goes on in Source mode.
      const id = tab!.id;
      setEditingTabs((t) => t.filter((x) => x !== id));
      setSourceTabs((t) => [...t.filter((x) => x !== id), id]);
    },
    onChange: () => {
      setSaveState(path, { state: "unsaved" });
      saveSoon(path);
    },
    onLeave: (s: EditorSession) => {
      edit.setEditorShown(undefined);
      keepEdits(path, s);
    },
  });

  return {
    toggleEdit,
    setMode,
    togglePreview,
    toggleSource,
    saveDoc,
    saveAs,
    writeDoc,
    tickTask,
    writeTick,
    unsavedAt,
    docActions,
    changedOnDisk,
    reloadFromDisk,
    keepMine,
    openCompare,
    confirmWindowClose,
    confirmSwitch,
    closeTabById,
    closeTabsById,
    dropImages,
    sourcePaneProps,
    editorPaneProps,
  };
}
