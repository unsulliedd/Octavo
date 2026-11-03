import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { Fragment, useCallback, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { Icon, Logo } from "./icons";
import { dirname } from "./paths";
import { keyLabel } from "./shortcuts";
import { pathItems, TabMenu, type TabMenuItem } from "./TabMenu";
import { useKeys } from "./useKeys";
import type { RecentFile } from "./storage";
import { PINNED, workspacePlace, type Workspace } from "./workspaces";

export const basename = (path: string) => path.split(/[\\/]/).pop() ?? path;

/** "Documents › Github › Octavo" — the last few folders of a path. */
export const folderTrail = (path: string, depth = 4) => dirname(path).split(/[\\/]/).filter(Boolean).slice(-depth).join(" › ");

function when(at: number) {
  if (!at) return "";
  const day = (t: number) => new Date(t).setHours(0, 0, 0, 0);
  const days = Math.round((day(Date.now()) - day(at)) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return days < 7 ? `${days} days ago` : new Date(at).toLocaleDateString();
}

type Props = {
  recent: RecentFile[];
  pinned: string[];
  dragging: boolean;
  error?: string;
  /** Saved workspaces, most recent first, with Pinned among them, and the open one. */
  workspaces: Workspace[];
  openWorkspace?: Workspace;
  onPick: () => void;
  onPickFolder: () => void;
  onOpen: (path: string) => void;
  onOpenWorkspace: (id: string) => void;
  onRemoveWorkspace: (id: string) => void;
  onTogglePin: (path: string) => void;
  onError: (message: string) => void;
};

/** The row a menu is open for: a document by its path or a workspace by its id, and where the menu opens. */
type RowMenu = { doc?: string; workspace?: string; x: number; y: number };

export function Home({ recent, pinned, dragging, error, workspaces, openWorkspace, onPick, onPickFolder, onOpen, onOpenWorkspace, onRemoveWorkspace, onTogglePin, onError }: Props) {
  const [menu, setMenu] = useState<RowMenu>();
  const opener = useRef<HTMLElement | null>(null);
  const closeMenu = useCallback(() => {
    setMenu(undefined);
    opener.current?.focus();
  }, []);
  /** Props for a row: the right-click, or the context-menu key or Shift+F10 on a focused row, opens its menu. */
  const menuProps = (which: Pick<RowMenu, "doc" | "workspace">) => ({
    "data-menu": (menu && menu.doc === which.doc && menu.workspace === which.workspace) || undefined,
    onContextMenu: (e: MouseEvent<HTMLElement>) => {
      e.preventDefault();
      opener.current = document.activeElement as HTMLElement | null;
      setMenu({ ...which, x: e.clientX, y: e.clientY });
    },
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      if (e.key !== "ContextMenu" && !(e.key === "F10" && e.shiftKey)) return;
      e.preventDefault();
      const at = e.currentTarget.getBoundingClientRect();
      opener.current = e.target as HTMLElement;
      setMenu({ ...which, x: at.left + 24, y: at.bottom });
    },
  });
  const rowItems = (m: RowMenu): TabMenuItem[] => {
    if (m.doc !== undefined) {
      const path = m.doc;
      return [
        { label: "Open", run: () => onOpen(path) },
        ...pathItems(path, (e) => onError(String(e))),
        "separator",
        { label: pinned.includes(path) ? "Unpin" : "Pin", run: () => onTogglePin(path) },
      ];
    }
    const w = workspaces.find((x) => x.id === m.workspace);
    if (!w) return [];
    const folder = w.items[0]?.kind === "folder" ? w.items[0].path : undefined;
    return [
      { label: "Open", run: () => onOpenWorkspace(w.id) },
      ...(folder ? [{ label: "Open folder in Explorer", run: () => void revealItemInDir(folder).catch((e) => onError(String(e))) }] : []),
      ...(w.id === PINNED.id ? [] : (["separator", { label: "Remove workspace", run: () => onRemoveWorkspace(w.id) }] as TabMenuItem[])),
    ];
  };
  const recentAt = new Map(recent.map((r) => [r.path, r.at]));
  const openKeys = keyLabel(useKeys(), "open");
  const row = (path: string, isPinned: boolean) => (
    <li key={path} className="file-row" {...menuProps({ doc: path })}>
      <button className="file-open" onClick={() => onOpen(path)} title={path}>
        <Icon name="file" size={18} />
        <span className="file-text">
          <span className="file-name">{basename(path)}</span>
          <span className="file-folder">{folderTrail(path)}</span>
        </span>
        <span className="file-when">{when(recentAt.get(path) ?? 0)}</span>
      </button>
      <button
        className="icon-btn pin"
        aria-pressed={isPinned}
        aria-label={`${isPinned ? "Unpin" : "Pin"} ${basename(path)}`}
        onClick={() => onTogglePin(path)}
      >
        <Icon name="pin" />
      </button>
    </li>
  );
  const unpinned = recent.map((r) => r.path).filter((p) => !pinned.includes(p));
  const saved = workspaces.filter((w) => w.id !== PINNED.id);

  return (
    <main className="home">
      <div className="home-inner">
        <div className="home-intro">
          <Logo />
          <h1>Open a Markdown document</h1>
          <p>Double-click any .md file, or open one here. Octavo shows it as a formatted document right away.</p>
          <div className="home-actions">
            <button className="primary" onClick={onPick}>
              <Icon name="open" />
              Open file…
            </button>
            <button className="secondary" onClick={onPickFolder}>
              <Icon name="folder" />
              Open folder…
            </button>
            {openKeys && (
              <span className="shortcut">
                {openKeys.split("+").map((k, i) => (
                  <Fragment key={i}>
                    {i > 0 && "+"}
                    <kbd>{k}</kbd>
                  </Fragment>
                ))}
              </span>
            )}
          </div>
          {error && <p className="error">{error}</p>}
        </div>

        <div className="drop-zone" data-active={dragging}>
          <Icon name="drop" size={18} />
          {dragging ? "Drop to open" : "Or drop a file anywhere in this window"}
        </div>

        {saved.length > 0 && (
          <section aria-labelledby="workspaces-h">
            <h2 id="workspaces-h" className="section-label">Recent workspaces</h2>
            <ul className="file-list">
              {saved.map((w) => (
                <li key={w.id} className="file-row" {...menuProps({ workspace: w.id })}>
                  <button className="file-open" onClick={() => onOpenWorkspace(w.id)} title={workspacePlace(w)}>
                    <Icon name="folder" size={18} />
                    <span className="file-text">
                      <span className="file-name">{w.name}</span>
                      <span className="file-folder">{workspacePlace(w)}</span>
                    </span>
                    {w === openWorkspace && <span className="file-when">Open</span>}
                  </button>
                  <button className="icon-btn pin" aria-label={`Remove workspace ${w.name}`} title="Remove workspace" onClick={() => onRemoveWorkspace(w.id)}>
                    <Icon name="close" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        {pinned.length > 0 && (
          <section aria-labelledby="pinned-h">
            <div className="section-head">
              <h2 id="pinned-h" className="section-label">Pinned</h2>
              <button className="link-btn" onClick={() => onOpenWorkspace(PINNED.id)}>Open as workspace</button>
            </div>
            <ul className="file-list">{pinned.map((p) => row(p, true))}</ul>
          </section>
        )}
        {unpinned.length > 0 && (
          <section aria-labelledby="recent-h">
            <h2 id="recent-h" className="section-label">Recent documents</h2>
            <ul className="file-list">{unpinned.map((p) => row(p, false))}</ul>
          </section>
        )}
      </div>
      {menu && <TabMenu name={menu.doc !== undefined ? basename(menu.doc) : (workspaces.find((w) => w.id === menu.workspace)?.name ?? "Workspace")} x={menu.x} y={menu.y} items={rowItems(menu)} onClose={closeMenu} />}
    </main>
  );
}
