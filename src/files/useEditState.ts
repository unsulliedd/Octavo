import { useRef, useState } from "react";
import type { EditorSession } from "@/editor/session";
import type { SourceEditor } from "@/source/sourceEditor";
import type { SourceSession } from "@/source/sourceSession";

/**
 * Edits not yet written to the file: the editor's Markdown, once rendered its HTML for reading, the file
 * text the edits were made to, whether the Markdown loads back as exactly what was edited, and whether it
 * was typed in Source mode, so the editor checks it can keep it before opening it.
 */
export type Draft = { text: string; html?: string; base: string; exact: boolean; source?: boolean };

/** The views of an edit session: the editor, the Markdown source, or the reading view of the edits. */
export type Mode = "edit" | "source" | "preview";

/** `refused`: the save failed because of the edits themselves, so trying again can't help until they change. */
export type SaveState = { state: "unsaved" | "saving" | "saved" | "error"; message?: string; refused?: boolean };

export type EditState = ReturnType<typeof useEditState>;

/** The state of the edit sessions, drafts and saves. It has no effects; `editActions` changes it. */
export function useEditState() {
  const switching = useRef(false);
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
  // The row under the toolbar the editor puts its formatting bar in.
  const [formatSlot, setFormatSlot] = useState<HTMLElement | null>(null);
  const [editBlocked, setEditBlocked] = useState<Record<string, string>>({});
  // The open editor's or Source view's session.
  const session = useRef<EditorSession | SourceSession>(undefined);
  // The open Source view, where its outline's headings start, and the timer that updates them while typing.
  const sourceEditor = useRef<SourceEditor>(undefined);
  const sourceHeadingStarts = useRef<number[]>([]);
  const sourceOutline = useRef<number>(undefined);
  // The file text the open editor's edits are made to.
  const editBase = useRef<{ path: string; base: string }>(undefined);

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

  function updateConflicts(fn: (all: Record<string, string>) => Record<string, string>) {
    conflictsRef.current = fn(conflictsRef.current);
    setConflicts(conflictsRef.current);
  }

  /** Whether `file` has edits not written to it: a draft, a conflict, or a save to come or that failed. */
  const unsavedAt = (file: string) =>
    !!drafts[file] || conflicts[file] !== undefined || saveStates[file]?.state === "unsaved" || saveStates[file]?.state === "error";
  /** Whether the reading view may write `file`'s task boxes: it has no edit session and nothing unsaved, so nothing else writes it. */
  const canTick = (file: string) => originals[file] === undefined && !unsavedAt(file);

  /** What the find bar searches while editing: the Source view, or the editor once it shows; nothing while reading. */
  const findTarget = (source: boolean, editorReady: boolean) =>
    source ? sourceEditor.current?.find : editorReady && session.current && "find" in session.current ? session.current.find : undefined;

  return {
    switching,
    editingTabs,
    setEditingTabs,
    sourceTabs,
    setSourceTabs,
    originals,
    originalsRef,
    drafts,
    draftsRef,
    saveStates,
    setSaveStates,
    autosaves,
    saveQueue,
    conflicts,
    conflictsRef,
    compare,
    setCompare,
    editorLoads,
    setEditorLoads,
    editorShown,
    setEditorShown,
    formatSlot,
    setFormatSlot,
    editBlocked,
    setEditBlocked,
    session,
    sourceEditor,
    findTarget,
    sourceHeadingStarts,
    sourceOutline,
    editBase,
    updateDrafts,
    setSaveState,
    updateOriginals,
    endSession,
    updateConflicts,
    unsavedAt,
    canTick,
  };
}
