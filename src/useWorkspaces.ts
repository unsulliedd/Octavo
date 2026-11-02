import { invoke } from "@tauri-apps/api/core";
import { message, open as openDialog } from "@tauri-apps/plugin-dialog";
import { useEffect, useMemo, useRef, useState } from "react";
import { loadOpenWorkspace, loadToldCopy, save } from "./storage";
import {
  fileTree,
  latestRun,
  problemText,
  scanResult,
  toFront,
  visibleDocuments,
  workspaceForFolder,
  type FolderScan,
  type Problem,
  type ScanResult,
  type Workspace,
} from "./workspaces";

/** Where the workspace menu opens: at `x`, under `y`, or above it when `above`. */
export type MenuPlace = { x: number; y: number; above?: boolean };

/**
 * The open workspace and the saved ones. One workspace is open at a time; with none, nothing here reads or writes a folder.
 * Before another workspace opens or the open one closes, `confirmLeave` decides whether it may; `onShown` runs in the same
 * step as the change, and once the saved list has loaded.
 */
export function useWorkspaces(showHidden: boolean, confirmLeave: () => Promise<boolean>, onShown: (id?: string) => void) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const list = useRef(workspaces);
  const [openId, setOpenId] = useState<string>();
  const [scanned, setScanned] = useState<ScanResult>();
  const [refreshing, setRefreshing] = useState(false);
  // Folders opened or closed by hand, by path; a rescan keeps them as they are.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [menu, setMenu] = useState<MenuPlace>();
  const loaded = useRef<Promise<void>>(undefined);
  // Saves run one after another, so the last one written is the latest list.
  const saves = useRef(Promise.resolve());
  // The saved file couldn't be read, so writing this session's list over it would lose what it holds.
  const unread = useRef(false);
  const toldErrors = useRef(new Set<string>());
  const startRun = useRef(latestRun()).current;

  const open = workspaces.find((w) => w.id === openId);
  const scan = scanned?.id === openId ? scanned : undefined;
  const docs = useMemo(() => (open && scan ? visibleDocuments(open, scan.scans) : undefined), [open, scan]);
  const tree = useMemo(() => docs && fileTree(docs), [docs]);
  const current = useRef({ open, showHidden });
  current.current = { open, showHidden };

  /** Tells the user where the copy of an unusable saved file is, once for each copy. */
  function tellProblem(problem: Problem) {
    if (problem.copy === loadToldCopy()) return;
    save("workspaceCopy", problem.copy);
    void message(problemText(problem), { title: "Octavo", kind: "warning" });
  }

  function tellError(text: string) {
    if (toldErrors.current.has(text)) return;
    toldErrors.current.add(text);
    void message(text, { title: "Octavo", kind: "error" });
  }

  function commit(next: Workspace[]) {
    list.current = next;
    setWorkspaces(next);
    if (unread.current) return;
    saves.current = saves.current.then(() =>
      invoke<Problem | null>("save_workspaces", { workspaces: next }).then(
        (problem) => void (problem && tellProblem(problem)),
        (e) => tellError(`The workspaces couldn't be saved, so they will be gone after Octavo closes: ${e}`),
      ),
    );
  }

  /** Scans the open workspace's folders. A later scan replaces this one, whichever finishes first. */
  async function rescan() {
    const isLatest = startRun();
    const { open, showHidden } = current.current;
    if (!open) return;
    const folders = open.items.filter((i) => i.kind === "folder").map((i) => i.path);
    const results = await Promise.all(
      folders.map((path) => invoke<FolderScan>("scan_folder", { path, showHidden }).catch((e): string => String(e))),
    );
    if (!isLatest()) return;
    setRefreshing(false);
    setScanned((previous) => scanResult(open.id, folders, results, previous));
  }

  async function show(next: Workspace[], id: string) {
    const other = id !== openId;
    if (other && !(await confirmLeave())) return;
    const ordered = toFront(next, id);
    if (ordered !== list.current) commit(ordered);
    save("workspace", id);
    if (!other) return void rescan();
    setOpenId(id);
    onShown(id);
  }

  /** Opens a saved workspace. */
  async function openWorkspace(id: string) {
    await loaded.current;
    await show(list.current, id);
  }

  /** Opens the workspace of `folder`, saving a new one the first time. */
  async function openFolderAt(folder: string) {
    await loaded.current;
    const { workspaces: next, workspace } = workspaceForFolder(list.current, folder);
    await show(next, workspace.id);
  }

  /** Lets the user pick a folder, starting at `defaultPath`, and opens it. */
  async function pickFolder(defaultPath?: string) {
    const folder = await openDialog({ directory: true, defaultPath });
    if (typeof folder === "string") await openFolderAt(folder);
  }

  /** Closes the open workspace. */
  async function closeWorkspace() {
    if (!(await confirmLeave())) return;
    setRefreshing(false);
    save("workspace", null);
    setOpenId(undefined);
    onShown(undefined);
  }

  function refresh() {
    setRefreshing(true);
    void rescan();
  }

  useEffect(() => {
    loaded.current ??= invoke<{ workspaces: Workspace[]; problem: Problem | null }>("load_workspaces").then(
      (result) => {
        list.current = result?.workspaces ?? [];
        setWorkspaces(list.current);
        if (result?.problem) tellProblem(result.problem);
        const id = loadOpenWorkspace();
        const found = list.current.some((w) => w.id === id);
        if (found) setOpenId(id);
        onShown(found ? id : undefined);
      },
      (e) => {
        unread.current = true;
        onShown(undefined);
        tellError(`The saved workspaces couldn't be read, so changes to them won't be saved until Octavo restarts: ${e}`);
      },
    );
  }, []);

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

  return { workspaces, open, scan, docs, tree, documents: docs?.length ?? 0, refreshing, expanded, setExpanded, menu, setMenu, whenLoaded, openWorkspace, openFolderAt, pickFolder, closeWorkspace, refresh };
}

export type Workspaces = ReturnType<typeof useWorkspaces>;
