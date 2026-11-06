import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { useCallback, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { coverTiles, firstLaunch, homeCards } from "./homeCards";
import { Icon, Logo, type IconName } from "./icons";
import { dirname } from "./paths";
import { pathItems, TabMenu, type TabMenuItem } from "./TabMenu";
import type { RecentFile } from "./storage";
import { PINNED, workspaceKind, workspacePlace, type Item, type Workspace, type WorkspaceKind } from "./workspaces";
import { described } from "./tooltip";

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

/** The mark before a card's second line. */
const KIND_ICON: Record<WorkspaceKind, IconName> = { folder: "folder", own: "layers", pinned: "pin" };

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
  onNewWorkspace: () => void;
  onRemoveWorkspace: (id: string) => void;
  onRenameWorkspace: (id: string) => void;
  /** The URL of a workspace's cover image, or none for the default cover. */
  coverUrl: (w: Workspace) => string | undefined;
  onChooseCover: (id: string) => Promise<void>;
  onRemoveCover: (id: string) => Promise<void>;
  /** The Add to item for a document's menu. */
  addTo: (item: Item) => TabMenuItem;
  onTogglePin: (path: string) => void;
  onError: (message: string) => void;
};

/** The row or card a menu is open for: a document by its path or a workspace by its id, and where the menu opens. */
type RowMenu = { doc?: string; workspace?: string; x: number; y: number };

/** The default cover of the workspace `id`. */
const Cover = ({ id }: { id: string }) => (
  <svg className="cover-art" viewBox="0 0 4 3" preserveAspectRatio="xMidYMid slice">
    {coverTiles(id).map((t) => (
      <g key={`${t.x} ${t.y}`} transform={`translate(${t.x} ${t.y})`}>
        <rect width="1.02" height="1.02" style={{ fill: t.background }} />
        {t.shape && <path d={t.shape} transform={`rotate(${t.turn} .5 .5)`} style={{ fill: t.fill }} />}
      </g>
    ))}
  </svg>
);

export function Home({ recent, pinned, dragging, error, workspaces, openWorkspace, onPick, onPickFolder, onOpen, onOpenWorkspace, onNewWorkspace, onRemoveWorkspace, onRenameWorkspace, coverUrl, onChooseCover, onRemoveCover, addTo, onTogglePin, onError }: Props) {
  const [menu, setMenu] = useState<RowMenu>();
  // Cover images that failed to load, such as one deleted outside Octavo; their cards show the default cover.
  const [failed, setFailed] = useState<string[]>([]);
  const opener = useRef<HTMLElement | null>(null);
  const closeMenu = useCallback(() => {
    setMenu(undefined);
    opener.current?.focus();
  }, []);
  const menuFor = (which: Pick<RowMenu, "doc" | "workspace">) => !!menu && menu.doc === which.doc && menu.workspace === which.workspace;
  /**
   * Props for a row or card: the right-click, or the context-menu key or Shift+F10 on a focused row, opens its menu.
   * From the keyboard the menu opens at `at`, from the row's box.
   */
  const menuProps = (which: Pick<RowMenu, "doc" | "workspace">, at = (box: DOMRect) => ({ x: box.left + 24, y: box.bottom })) => ({
    "data-menu": menuFor(which) || undefined,
    onContextMenu: (e: MouseEvent<HTMLElement>) => {
      e.preventDefault();
      opener.current = document.activeElement as HTMLElement | null;
      setMenu({ ...which, x: e.clientX, y: e.clientY });
    },
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      if (e.key !== "ContextMenu" && !(e.key === "F10" && e.shiftKey)) return;
      e.preventDefault();
      opener.current = e.target as HTMLElement;
      setMenu({ ...which, ...at(e.currentTarget.getBoundingClientRect()) });
    },
  });
  const cards = homeCards(workspaces);
  const rowItems = (m: RowMenu): TabMenuItem[] => {
    if (m.doc !== undefined) {
      const path = m.doc;
      return [
        { label: "Open", run: () => onOpen(path) },
        ...pathItems(path, (e) => onError(String(e))),
        "separator",
        addTo({ kind: "document", path }),
        { label: pinned.includes(path) ? "Unpin" : "Pin", run: () => onTogglePin(path) },
      ];
    }
    const w = cards.find((x) => x.id === m.workspace);
    if (!w) return [];
    const open: TabMenuItem = { label: "Open", run: () => onOpenWorkspace(w.id) };
    if (w.id === PINNED.id) return [open];
    const folder = workspaceKind(w) === "folder" && w.items[0]?.kind === "folder" ? w.items[0].path : undefined;
    return [
      open,
      { label: "Rename…", run: () => onRenameWorkspace(w.id) },
      { label: "Choose image…", run: () => void onChooseCover(w.id).catch((e) => onError(String(e))) },
      ...(w.cover ? [{ label: "Remove image", run: () => void onRemoveCover(w.id).catch((e) => onError(String(e))) }] : []),
      "separator",
      ...(folder ? ([{ label: "Open folder in Explorer", run: () => void revealItemInDir(folder).catch((e) => onError(String(e))) }, "separator"] as TabMenuItem[]) : []),
      { label: "Remove workspace", run: () => onRemoveWorkspace(w.id) },
    ];
  };
  const recentAt = new Map(recent.map((r) => [r.path, r.at]));
  const first = firstLaunch(workspaces, recent);

  const actions = (
    <>
      <button className="primary" onClick={onPick}>
        <Icon name="open" size="inline" />
        Open file…
      </button>
      <button className="secondary" onClick={onPickFolder}>
        <Icon name="folder" size="inline" />
        Open folder…
      </button>
    </>
  );
  const newCard = (
    <li className="card-cell">
      <button className="card-new" onClick={onNewWorkspace}>
        <span className="card-new-plus">
          <Icon name="plus" size="card" />
        </span>
        <span className="card-new-label">New workspace</span>
      </button>
    </li>
  );
  const card = (w: Workspace) => {
    const place = workspacePlace(w);
    const kind = workspaceKind(w);
    const open = w.id === openWorkspace?.id;
    const which = { workspace: w.id };
    const src = coverUrl(w);
    return (
      <li key={w.id} className="card-cell">
        {/* From the keyboard the menu opens where the ⋯ button is. */}
        <div className="card" {...menuProps(which, (box) => ({ x: box.right - 34, y: box.top + 36 }))}>
          <div className="cover" aria-hidden="true">
            {src && !failed.includes(src) ? <img className="cover-art" src={src} alt="" onError={() => setFailed((f) => [...f, src])} /> : <Cover id={w.id} />}
            {open && <span className="card-chip">Open</span>}
          </div>
          <div className="card-text">
            <span className="card-name">{w.name}</span>
            <span className="card-meta" data-kind={kind}>
              <Icon name={KIND_ICON[kind]} size="inline" />
              <span className="card-meta-text">{place}</span>
            </span>
          </div>
          <button
            className="card-open"
            aria-label={`${w.name}, ${place}${open ? ", open" : ""}`}
            data-tip={kind === "folder" ? w.items[0]?.path : undefined}
            onClick={() => onOpenWorkspace(w.id)}
          />
          <button
            className="icon-btn small card-more"
            aria-label={`More for ${w.name}`}
            aria-haspopup="menu"
            aria-expanded={menuFor(which)}
            onClick={(e) => {
              const box = e.currentTarget.getBoundingClientRect();
              opener.current = e.currentTarget;
              setMenu({ ...which, x: box.left, y: box.bottom + 4 });
            }}
          >
            <Icon name="more" size="inline" />
          </button>
        </div>
      </li>
    );
  };
  const row = (path: string) => {
    const isPinned = pinned.includes(path);
    return (
      <li key={path} className="file-row" {...menuProps({ doc: path })}>
        <button className="file-open" onClick={() => onOpen(path)} {...described(path)}>
          <Icon name="markdown" size="home" />
          <span className="file-text">
            <span className="file-name">{basename(path)}</span>
            <span className="file-folder">{folderTrail(path)}</span>
          </span>
          <span className="file-when">{when(recentAt.get(path) ?? 0)}</span>
        </button>
        <button className="icon-btn pin" aria-pressed={isPinned} aria-label={`${isPinned ? "Unpin" : "Pin"} ${basename(path)}`} onClick={() => onTogglePin(path)}>
          <Icon name="pin" />
        </button>
      </li>
    );
  };

  return (
    <>
      <main className="home" data-first={first || undefined}>
        <div className="home-inner">
          {first ? (
            <>
              <div className="home-intro">
                <Logo />
                <h1>Open a Markdown document</h1>
                <p>Double-click any .md file, or open one here. Octavo shows it as a formatted document right away.</p>
                <div className="home-actions">{actions}</div>
                {error && <p className="error">{error}</p>}
              </div>
              <div className="drop-zone" data-active={dragging}>
                <Icon name="drop" size="home" />
                {dragging ? "Drop to open" : "Or drop a file anywhere in this window"}
              </div>
              <section className="home-sec" aria-labelledby="workspaces-h">
                <h2 id="workspaces-h" className="home-sec-title">
                  Workspaces
                </h2>
                <div className="home-first-cards">
                  <ul className="card-grid">{newCard}</ul>
                  <p className="home-aside">A workspace keeps folders and documents together. Open a folder, or start your own and add to it from any right-click menu.</p>
                </div>
              </section>
            </>
          ) : (
            <>
              <div className="home-head">
                <h1 id="workspaces-h">Workspaces</h1>
                {actions}
              </div>
              {error && <p className="error">{error}</p>}
              <section aria-labelledby="workspaces-h">
                <ul className="card-grid">
                  {newCard}
                  {cards.map(card)}
                </ul>
              </section>
              {recent.length > 0 && (
                <section className="home-sec" aria-labelledby="recent-h">
                  <h2 id="recent-h" className="home-sec-title">
                    Recent documents
                  </h2>
                  <ul className="file-list doc-grid">{recent.map((r) => row(r.path))}</ul>
                </section>
              )}
            </>
          )}
        </div>
        {menu && <TabMenu name={menu.doc !== undefined ? basename(menu.doc) : (cards.find((w) => w.id === menu.workspace)?.name ?? "Workspace")} x={menu.x} y={menu.y} items={rowItems(menu)} onClose={closeMenu} />}
      </main>
      {dragging && !first && <div className="drop-overlay">Drop to open</div>}
    </>
  );
}
