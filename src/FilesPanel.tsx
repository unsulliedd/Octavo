import { invoke } from "@tauri-apps/api/core";
import { memo, useEffect, useState, type CSSProperties, type MouseEvent } from "react";
import { folderTrail } from "./Home";
import { Icon } from "./icons";
import { dirname } from "./paths";
import { TabMenu } from "./TabMenu";
import { samePath } from "./tabs";
import type { Workspaces } from "./useWorkspaces";
import { workspaceFolderName, workspacePlace, type TreeNode } from "./workspaces";

/** With more documents than this, a folder below the top starts closed, so that a large workspace stays quick to draw. */
const OPEN_FOLDERS_UP_TO = 500;

/** How far each level of the tree is indented: a child's icon sits under its folder's. */
const INDENT = 18;

type TreeProps = {
  nodes: TreeNode[];
  depth: number;
  openBelowTop: boolean;
  expanded: Workspaces["expanded"];
  active?: string;
  onToggle: (path: string, open: boolean) => void;
  onOpen: (path: string) => void;
};

/** Memoized: the app draws often while reading and editing, and a tree can hold thousands of rows. */
const Tree = memo(function Tree({ nodes, depth, ...rest }: TreeProps) {
  const { openBelowTop, expanded, active, onToggle, onOpen } = rest;
  const padding = { paddingLeft: 8 + depth * INDENT };
  return nodes.map((node) => {
    if (node.kind === "document") {
      return (
        <button key={node.path} className="tree-row" style={padding} title={node.path} aria-current={!!active && samePath(active, node.path) ? "page" : undefined} onClick={() => onOpen(node.path)}>
          <Icon name="file" size={14} />
          <span className="tree-name">{node.name}</span>
        </button>
      );
    }
    const open = expanded[node.path] ?? (depth === 0 || openBelowTop);
    return (
      <div key={node.path} className="tree-folder">
        <button className="tree-row" data-folder style={padding} title={node.path} aria-expanded={open} onClick={() => onToggle(node.path, !open)}>
          <Icon name={open ? "down" : "forward"} size={14} />
          <Icon name="folder" size={15} />
          <span className="tree-name">{node.name}</span>
        </button>
        {open && (
          <div className="tree-children" style={{ "--guide": `${14 + depth * INDENT}px` } as CSSProperties}>
            <Tree nodes={node.children} depth={depth + 1} {...rest} />
          </div>
        )}
      </div>
    );
  });
});

/** Opens or closes the workspace menu under or above the button that was clicked. */
const toggleMenu = (ws: Workspaces, above: boolean) => (e: MouseEvent) => {
  const box = e.currentTarget.getBoundingClientRect();
  ws.setMenu((menu) => (menu ? undefined : { x: box.left, y: above ? box.top : box.bottom, above }));
};

/** The workspace's name in the status bar, opening the workspace menu. */
export function WorkspaceStatus({ ws }: { ws: Workspaces }) {
  if (!ws.open) return null;
  return (
    <button className="status-workspace" data-menu-toggle aria-haspopup="menu" aria-expanded={!!ws.menu?.above} title={`Workspace: ${workspacePlace(ws.open)}`} onClick={toggleMenu(ws, true)}>
      <Icon name="folder" size={13} />
      {ws.open.name}
    </button>
  );
}

/** The menu for switching workspaces, opening a folder and closing the open workspace. */
export function WorkspaceMenu({ ws }: { ws: Workspaces }) {
  if (!ws.menu) return null;
  return (
    <TabMenu
      name="Workspaces"
      x={ws.menu.x}
      y={ws.menu.y}
      above={ws.menu.above}
      items={[
        ...ws.workspaces.map((w) => ({ label: w.name, checked: w.id === ws.open?.id, run: () => void ws.openWorkspace(w.id) })),
        "separator",
        { label: "Open folder…", run: () => void ws.pickFolder() },
        { label: "Close workspace", disabled: !ws.open, run: ws.closeWorkspace },
      ]}
      onClose={() => ws.setMenu(undefined)}
    />
  );
}

/** The Files tab with no workspace open: offers the folder around the shown document. Nothing opens until a button is pressed. */
function Offer({ ws, document }: { ws: Workspaces; document: string }) {
  const [folder, setFolder] = useState<string>();
  useEffect(() => {
    let shown = true;
    const dir = dirname(document);
    invoke<string>("workspace_folder", { dir }).then(
      (found) => shown && setFolder(found ?? dir),
      () => shown && setFolder(dir),
    );
    return () => void (shown = false);
  }, [document]);
  return (
    <div className="files-offer">
      <div className="files-offer-text">
        <strong>No workspace open</strong>
        <span>Open a folder to see its Markdown documents here.</span>
      </div>
      {folder && (
        <div className="files-offer-folder">
          <button className="primary" onClick={() => void ws.openFolderAt(folder)}>
            <Icon name="folder" size={14} />
            <span>Open {workspaceFolderName(folder)} folder</span>
          </button>
          <span title={folder}>{folderTrail(`${folder}/`)}</span>
        </div>
      )}
      <button className="secondary" onClick={() => void ws.pickFolder(folder)}>
        Choose folder…
      </button>
    </div>
  );
}

type Props = {
  ws: Workspaces;
  /** The document shown, if any. */
  document?: string;
  onOpen: (path: string) => void;
};

/** The Files tab: the open workspace's documents, or the offer to open a workspace. */
export function FilesPanel({ ws, document, onOpen }: Props) {
  const { open, scan, tree, setExpanded } = ws;
  // Stable, so that the memoized tree is drawn again only when it changes.
  const [onToggle] = useState(() => (path: string, shown: boolean) => setExpanded((all) => ({ ...all, [path]: shown })));
  if (!open) return document ? <Offer ws={ws} document={document} /> : null;
  return (
    <>
      <div className="files-head">
        <button className="workspace-name" data-menu-toggle aria-haspopup="menu" aria-expanded={!!ws.menu && !ws.menu.above} title={workspacePlace(open)} onClick={toggleMenu(ws, false)}>
          <span className="tree-name">{open.name}</span>
          <Icon name="down" size={13} />
        </button>
        <button className="icon-btn" data-busy={ws.refreshing || undefined} aria-label="Refresh" title="Refresh" onClick={ws.refresh}>
          <Icon name="refresh" size={14} />
        </button>
      </div>
      {!scan && (
        <p className="files-note" role="status">
          <span className="spinner small" aria-hidden="true" />
          Scanning {open.name}…
        </p>
      )}
      {scan?.errors.map((error) => (
        <p key={error} className="files-note error" role="alert">
          {error}
        </p>
      ))}
      {scan?.truncated && <p className="files-note">This folder is too large to scan in full, so some documents may be missing.</p>}
      {scan && !scan.errors.length && !tree?.length && <p className="files-note">No Markdown documents in this workspace.</p>}
      {tree && (
        <nav className="tree" aria-label="Workspace documents">
          <Tree nodes={tree} depth={0} openBelowTop={ws.documents <= OPEN_FOLDERS_UP_TO} expanded={ws.expanded} active={document} onToggle={onToggle} onOpen={onOpen} />
        </nav>
      )}
    </>
  );
}
