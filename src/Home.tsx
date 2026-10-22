import { Fragment } from "react";
import { Icon, Logo } from "./icons";
import { dirname } from "./paths";
import { keyLabel } from "./shortcuts";
import { useKeys } from "./useKeys";
import type { RecentFile } from "./storage";

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
  onPick: () => void;
  onOpen: (path: string) => void;
  onTogglePin: (path: string) => void;
};

export function Home({ recent, pinned, dragging, error, onPick, onOpen, onTogglePin }: Props) {
  const recentAt = new Map(recent.map((r) => [r.path, r.at]));
  const openKeys = keyLabel(useKeys(), "open");
  const row = (path: string, isPinned: boolean) => (
    <li key={path} className="file-row">
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

        {pinned.length > 0 && (
          <section aria-labelledby="pinned-h">
            <h2 id="pinned-h" className="section-label">Pinned</h2>
            <ul className="file-list">{pinned.map((p) => row(p, true))}</ul>
          </section>
        )}
        {unpinned.length > 0 && (
          <section aria-labelledby="recent-h">
            <h2 id="recent-h" className="section-label">Recent</h2>
            <ul className="file-list">{unpinned.map((p) => row(p, false))}</ul>
          </section>
        )}
      </div>
    </main>
  );
}
