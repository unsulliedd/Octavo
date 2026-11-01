// Workspaces: saved lists of folders and documents, minus what was removed. An opened folder, a hand-picked set and
// Pinned are all this type. All functions return a new state and leave the old one unchanged.

import { dirname, joinPath, relativePath } from "./paths";

export type ItemKind = "folder" | "document";
export type Item = { kind: ItemKind; path: string };
export type Workspace = { id: string; name: string; items: Item[]; removed: string[] };

/** A document a workspace shows. `root` is the folder it is listed under; `relative` is its path from there, with forward slashes. */
export type WorkspaceDoc = { path: string; root: string; relative: string };

export type TreeNode =
  | { kind: "folder"; name: string; path: string; children: TreeNode[] }
  | { kind: "document"; name: string; path: string };

export const PINNED: Workspace = { id: "pinned", name: "Pinned", items: [], removed: [] };

/**
 * `path` as paths compare here. It follows `samePath` for case and also evens out separators, so that a file picked
 * in a dialog matches a saved path; it is a plain string, so that large lists can use a Set. Every key ends in a
 * separator, so the key of a file or folder inside a folder starts with the key of that folder.
 */
function key(path: string) {
  const clean = joinPath(path, ".");
  return /^[a-z]:|^[\\/]{2}|\\/i.test(clean) ? `${clean.replace(/\//g, "\\").toLowerCase()}\\` : `${clean}/`;
}

const same = (a: string, b: string) => key(a) === key(b);

/** The last name in `path`: the folder "C:\Docs\Notes" gives "Notes". */
const lastName = (path: string) => path.split(/[\\/]+/).filter(Boolean).pop() ?? path;

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2);

/** `workspaces`, with Pinned first when it is not there yet. */
export const withPinned = (workspaces: Workspace[]) => (workspaces.some((w) => w.id === PINNED.id) ? workspaces : [PINNED, ...workspaces]);

/** `workspaces` without the workspace `id`. Pinned stays. */
export const deleteWorkspace = (workspaces: Workspace[], id: string) => (id === PINNED.id ? workspaces : workspaces.filter((w) => w.id !== id));

/**
 * The workspace opened from `folder`, which holds it as its first item, or a new one named after it. A workspace
 * that only had the folder added to it is a different one.
 */
export function workspaceForFolder(workspaces: Workspace[], folder: string) {
  const isFor = (w: Workspace) => w.items[0]?.kind === "folder" && same(w.items[0].path, folder);
  const found = workspaces.find(isFor);
  if (found) return { workspaces, workspace: found };
  const workspace: Workspace = { id: newId(), name: lastName(folder), items: [{ kind: "folder", path: folder }], removed: [] };
  return { workspaces: [...workspaces, workspace], workspace };
}

/** Adds a folder or document, showing it again if it was removed. */
export function addItem(workspace: Workspace, item: Item): Workspace {
  return {
    ...restorePath(workspace, item.path),
    items: workspace.items.some((i) => same(i.path, item.path)) ? workspace.items : [...workspace.items, item],
  };
}

/** Hides a folder or document from this workspace. Its item stays, so `restorePath` brings it back. */
export function removeItem(workspace: Workspace, path: string): Workspace {
  return workspace.removed.some((p) => same(p, path)) ? workspace : { ...workspace, removed: [...workspace.removed, path] };
}

/** Shows a removed path again. */
export function restorePath(workspace: Workspace, path: string): Workspace {
  return { ...workspace, removed: workspace.removed.filter((p) => !same(p, path)) };
}

/**
 * The documents `workspace` shows. `scans` holds the Markdown files of each folder item, by the item's path. A document
 * in two overlapping folders shows once, under the outer one.
 */
// Limitation: a document added by hand stays hidden while a folder around it is removed.
export function visibleDocuments(workspace: Workspace, scans: Record<string, string[]>) {
  const removed = workspace.removed.map(key);
  const seen = new Set<string>();
  const docs: WorkspaceDoc[] = [];
  const add = (path: string, root: string) => {
    const k = key(path);
    if (seen.has(k) || removed.some((r) => k.startsWith(r))) return;
    seen.add(k);
    docs.push({ path, root, relative: relativePath(root, path) });
  };
  const folders = workspace.items.filter((i) => i.kind === "folder").sort((a, b) => key(a.path).length - key(b.path).length);
  for (const folder of folders) for (const path of scans[folder.path] ?? []) add(path, folder.path);
  for (const item of workspace.items) if (item.kind === "document") add(item.path, dirname(item.path));
  return docs;
}

const inTreeOrder = (a: TreeNode, b: TreeNode) =>
  a.kind === b.kind ? a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }) : a.kind === "folder" ? -1 : 1;

function sortTree(nodes: TreeNode[]) {
  nodes.sort(inTreeOrder);
  for (const node of nodes) if (node.kind === "folder") sortTree(node.children);
  return nodes;
}

/** The tree for the Files tab: one folder per root, in order, and only folders that lead to a document. */
export function fileTree(docs: WorkspaceDoc[]) {
  const top: TreeNode[] = [];
  const folders = new Map<string, Extract<TreeNode, { kind: "folder" }>>();
  const folderIn = (siblings: TreeNode[], name: string, path: string) => {
    const k = key(path);
    let folder = folders.get(k);
    if (!folder) {
      folder = { kind: "folder", name, path, children: [] };
      folders.set(k, folder);
      siblings.push(folder);
    }
    return folder;
  };
  for (const doc of docs) {
    const parts = doc.relative.split("/");
    const name = parts.pop()!;
    let folder = folderIn(top, lastName(doc.root), doc.root);
    for (const part of parts) folder = folderIn(folder.children, part, joinPath(folder.path, part));
    folder.children.push({ kind: "document", name, path: doc.path });
  }
  return sortTree(top);
}

/** The documents whose relative path holds every word of `query`, in any order, without regard to case. */
export function filterDocuments(docs: WorkspaceDoc[], query: string) {
  const words = query.replace(/\\/g, "/").toLowerCase().split(/\s+/).filter(Boolean);
  return docs.filter((doc) => {
    const relative = doc.relative.toLowerCase();
    return words.every((word) => relative.includes(word));
  });
}
