import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { ask, message, promptText } from "./dialog";
import { useEffect, useMemo, useRef, useState } from "react";
import { dirname } from "./paths";
import { forget, loadOpenWorkspace, loadPinned, loadToldCopy, save, tabsKey } from "./storage";
import {
  addItem,
  deleteWorkspace,
  dropItem,
  fileTree,
  latestRun,
  newWorkspace,
  PINNED,
  pinnedPaths,
  problemText,
  removeEntry,
  renameWorkspace,
  restorePath,
  same,
  scanResult,
  toFront,
  togglePin as pinOrUnpin,
  visibleDocuments,
  withPinned,
  withPins,
  workspaceFolderName,
  workspaceForFolder,
  workspaceKind,
  type FolderScan,
  type Item,
  type ItemKind,
  type Problem,
  type ScanResult,
  type Workspace,
} from "./workspaces";

/** Where the workspace menu opens: at `x`, under `y`, or above it when `above`. */
export type MenuPlace = { x: number; y: number; above?: boolean };

/** The right-click menu of a row in the tree. */
export type RowMenu = { name: string; kind: ItemKind; path: string; x: number; y: number };

/** Where the added `documents` group, and which of them are gone from disk. */
async function documentPlaces(documents: string[]) {
  if (!documents.length) return { roots: {}, missing: [] };
  const [missing, folders] = await Promise.all([
    invoke<string[] | null>("missing_documents", { paths: documents }).catch(() => null),
    Promise.all(documents.map((path) => invoke<string>("workspace_folder", { dir: dirname(path) }).catch(() => dirname(path)))),
  ]);
  return { roots: Object.fromEntries(documents.map((path, i) => [path, folders[i]])), missing: missing ?? [] };
}

/**
 * The open workspace and the saved ones. One workspace is open at a time; with none, nothing here reads or writes a folder.
 * Before another workspace opens or the open one closes, `confirmLeave` decides whether it may; `onShown` runs in the same
 * step as the change, and once the saved list has loaded. A document to `carry` is passed on to `onShown` when the
 * workspace it opens is another one.
 */
export function useWorkspaces(showHidden: boolean, confirmLeave: () => Promise<boolean>, onShown: (id?: string, carry?: string) => void) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>(() => withPins(withPinned([]), loadPinned() ?? []));
  const list = useRef(workspaces);
  const [openId, setOpenId] = useState<string>();
  const [scanned, setScanned] = useState<ScanResult>();
  const [refreshing, setRefreshing] = useState(false);
  // Folders opened or closed by hand, by path; a rescan keeps them as they are.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [menu, setMenu] = useState<MenuPlace>();
  const [rowMenu, setRowMenu] = useState<RowMenu>();
  const loaded = useRef<Promise<void>>(undefined);
  // Saves run one after another, so the last one written is the latest list.
  const saves = useRef(Promise.resolve());
  // The saved file couldn't be read, so writing this session's list over it would lose what it holds.
  const unread = useRef(false);
  // The pins in local storage are still the safe copy: they follow every change until a save has put them in the file.
  const pinsLocal = useRef(false);
  // Workspaces just deleted, whose stored tabs go once the tabs on screen have stopped using them.
  const deleted = useRef<string[]>([]);
  const toldErrors = useRef(new Set<string>());
  const startRun = useRef(latestRun()).current;

  const open = workspaces.find((w) => w.id === openId);
  const scan = scanned?.id === openId ? scanned : undefined;
  const listed = useMemo(() => (open && scan ? visibleDocuments(open, scan.scans, scan.roots, scan.missing) : undefined), [open, scan]);
  const docs = useMemo(() => listed?.filter((d) => !d.missing), [listed]);
  // Pinned and own workspaces list a document added by itself at the top, a folder workspace under its folder.
  const tree = useMemo(() => listed && open && fileTree(listed, workspaceKind(open) === "folder" ? undefined : open.items.filter((i) => i.kind === "folder").map((i) => i.path)), [listed, open]);
  const pinned = useMemo(() => pinnedPaths(workspaces), [workspaces]);
  const current = useRef({ open, showHidden, docs });
  current.current = { open, showHidden, docs };

  /** Tells the user where the copy of an unusable saved file is, once for each copy. */
  function tellProblem(problem: Problem) {
    if (problem.copy === loadToldCopy()) return;
    save("workspaceCopy", problem.copy);
    void message(problemText(problem));
  }

  function tellError(text: string) {
    if (toldErrors.current.has(text)) return;
    toldErrors.current.add(text);
    void message(text);
  }

  function commit(next: Workspace[]) {
    list.current = next;
    setWorkspaces(next);
    if (pinsLocal.current) save("pinned", pinnedPaths(next));
    if (unread.current) return;
    saves.current = saves.current.then(() =>
      invoke<Problem | null>("save_workspaces", { workspaces: next }).then(
        (problem) => {
          if (pinsLocal.current) {
            pinsLocal.current = false;
            forget("pinned");
          }
          if (problem) tellProblem(problem);
        },
        (e) => tellError(`The workspaces couldn't be saved, so they will be gone after Octavo closes: ${e}`),
      ),
    );
  }

  /** Scans the open workspace's folders. A later scan replaces this one, whichever finishes first. */
  async function rescan() {
    const isLatest = startRun();
    const { open, showHidden } = current.current;
    if (!open) return;
    const paths = (kind: ItemKind) => open.items.filter((i) => i.kind === kind).map((i) => i.path);
    const folders = paths("folder");
    const [results, { roots, missing }] = await Promise.all([
      Promise.all(folders.map((path) => invoke<FolderScan>("scan_folder", { path, showHidden }).catch((e): string => String(e)))),
      documentPlaces(paths("document")),
    ]);
    if (!isLatest()) return;
    setRefreshing(false);
    setScanned((previous) => scanResult(open.id, folders, results, previous, roots, missing));
  }

  async function show(next: Workspace[], id: string, carry?: string) {
    const other = id !== openId;
    if (other && !(await confirmLeave())) return;
    const ordered = toFront(next, id);
    if (ordered !== list.current) commit(ordered);
    save("workspace", id);
    if (!other) return void rescan();
    setOpenId(id);
    onShown(id, carry);
  }

  /** Opens a saved workspace. */
  async function openWorkspace(id: string) {
    await loaded.current;
    await show(list.current, id);
  }

  /** Opens the workspace of `folder`, saving a new one the first time; `carry` is a document to bring along as a tab. */
  async function openFolderAt(folder: string, carry?: string) {
    await loaded.current;
    const { workspaces: next, workspace } = workspaceForFolder(list.current, folder);
    await show(next, workspace.id, carry);
  }

  /** Lets the user pick a folder, starting at `defaultPath`, and opens it, with `carry` as for `openFolderAt`. */
  async function pickFolder(defaultPath?: string, carry?: string) {
    const folder = await openDialog({ directory: true, defaultPath });
    if (typeof folder === "string") await openFolderAt(folder, carry);
  }

  /** Closes the open workspace. Resolves to whether it closed. */
  async function closeWorkspace() {
    if (!(await confirmLeave())) return false;
    setRefreshing(false);
    save("workspace", null);
    setOpenId(undefined);
    onShown(undefined);
    return true;
  }

  /** Changes the workspace `id`, by default the open one. */
  async function change(edit: (workspace: Workspace) => Workspace, id = current.current.open?.id) {
    await loaded.current;
    commit(list.current.map((w) => (w.id === id ? edit(w) : w)));
  }

  /** Whether the open workspace shows the document `path`. */
  const covers = (path: string) => !!current.current.docs?.some((d) => same(d.path, path));

  /** Adds a folder or document to the open workspace. A document it shows already stays as it is. */
  async function addToOpen(item: Item) {
    if (item.kind === "folder" || !covers(item.path)) await change((w) => addItem(w, item));
  }

  /** Lets the user pick a folder or document for the open workspace. */
  async function pickItem(kind: ItemKind) {
    const path = await openDialog(kind === "folder" ? { directory: true } : { filters: [{ name: "Markdown", extensions: ["md", "markdown"] }] });
    if (typeof path === "string") await addToOpen({ kind, path });
  }

  /** Remove from workspace, for a row of the tree. */
  const removeRow = (path: string) => change((w) => removeEntry(w, path));
  /** Shows a removed path again. */
  const restore = (path: string) => change((w) => restorePath(w, path));
  /** Takes a document that is gone from disk out of the open workspace. */
  const dropMissing = (path: string) => change((w) => dropItem(w, path));
  /** Pins `path`, or unpins it. */
  const togglePin = (path: string) => change((w) => pinOrUnpin(w, path), PINNED.id);

  /** Adds a folder or document to the workspace `id`, open or not. */
  const addTo = (id: string, item: Item) => change((w) => addItem(w, item), id);

  /**
   * Asks for a name and makes a workspace of the user's own. With `item`, the workspace holds it and Octavo stays where
   * it is; without, the new empty workspace opens.
   */
  async function createWorkspace(item?: Item) {
    await loaded.current;
    const text = item ? `${workspaceFolderName(item.path)} goes in it.` : "Add folders and documents to it with + in the Files tab, or right-click any document.";
    const name = await promptText(text, { title: "New workspace", okLabel: "Create" });
    if (!name) return;
    const { workspaces: next, workspace } = newWorkspace(list.current, name, item ? [item] : []);
    if (item) commit(next);
    else await show(next, workspace.id);
  }

  /** Asks for a new name for the workspace `id`. Pinned keeps its name. */
  async function rename(id: string) {
    await loaded.current;
    const workspace = list.current.find((w) => w.id === id);
    if (!workspace || id === PINNED.id) return;
    const text = workspaceKind(workspace) === "folder" ? "The folder on disk keeps its name." : "";
    const name = await promptText(text, { title: "Rename workspace", value: workspace.name, okLabel: "Rename" });
    const next = name === undefined ? list.current : renameWorkspace(list.current, id, name);
    if (next !== list.current) commit(next);
  }

  /** Removes a saved workspace from Octavo, after asking. The open one closes first, so that unsaved edits settle. */
  async function removeWorkspace(id: string) {
    await loaded.current;
    const workspace = list.current.find((w) => w.id === id);
    if (!workspace || id === PINNED.id) return;
    const yes = await ask(`Remove the workspace "${workspace.name}" from Octavo? Its list of folders, documents and tabs goes. Nothing on disk changes.`, {
      okLabel: "Remove",
      cancelLabel: "Keep",
      danger: true,
    });
    if (!yes || (id === current.current.open?.id && !(await closeWorkspace()))) return;
    deleted.current.push(id);
    commit(deleteWorkspace(list.current, id));
  }

  function refresh() {
    setRefreshing(true);
    void rescan();
  }

  useEffect(() => {
    loaded.current ??= invoke<{ workspaces: Workspace[]; problem: Problem | null }>("load_workspaces").then(
      (result) => {
        const pins = loadPinned();
        const next = withPins(withPinned(result?.workspaces ?? []), pins ?? []);
        pinsLocal.current = !!pins;
        // A saved file that can't be used is replaced only by a change the user makes, so the pins wait for that.
        if (pins && !result?.problem) {
          commit(next);
        } else {
          list.current = next;
          setWorkspaces(next);
        }
        if (result?.problem) tellProblem(result.problem);
        const id = loadOpenWorkspace();
        const found = list.current.some((w) => w.id === id);
        if (found) setOpenId(id);
        onShown(found ? id : undefined);
      },
      (e) => {
        unread.current = true;
        pinsLocal.current = true;
        onShown(undefined);
        tellError(`The saved workspaces couldn't be read, so changes to them won't be saved until Octavo restarts: ${e}`);
      },
    );
  }, []);

  useEffect(() => {
    deleted.current.splice(0).forEach((id) => forget(tabsKey(id)));
  }, [workspaces]);

  const rescanNow = useRef(rescan);
  rescanNow.current = rescan;
  const folders = open?.items.map((i) => i.path).join("\n");
  useEffect(() => {
    if (openId) void rescanNow.current();
  }, [openId, folders, showHidden]);

  useEffect(() => {
    const onFocus = () => void rescanNow.current();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  /** Resolves once the saved list has loaded and the open workspace, if any, is known. */
  const whenLoaded = () => loaded.current;

  return { workspaces, open, pinned, scan, docs, tree, documents: docs?.length ?? 0, refreshing, expanded, setExpanded, menu, setMenu, rowMenu, setRowMenu, whenLoaded, openWorkspace, openFolderAt, pickFolder, closeWorkspace, refresh, addTo, createWorkspace, rename, pickItem, removeRow, restore, dropMissing, togglePin, removeWorkspace, tellError };
}

export type Workspaces = ReturnType<typeof useWorkspaces>;
