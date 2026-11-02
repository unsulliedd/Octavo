import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./icons";
import { cycleFocus } from "./largeView";
import { moveActive, quickResults } from "./quickSearch";
import type { Workspaces } from "./useWorkspaces";

type Props = { ws: Workspaces; onOpen: (path: string) => void; onClose: () => void };

/**
 * The box Ctrl+P opens over the window: a search over the open workspace's documents by relative path. Up and Down
 * move through the results, Enter or a click opens one, Escape or a click outside closes the box and focus goes back
 * to where it was. With no workspace open it offers to open a folder.
 */
export function QuickOpen({ ws, onOpen, onClose }: Props) {
  const panel = useRef<HTMLElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [opener] = useState(() => document.activeElement);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const close = useRef(onClose);
  close.current = onClose;

  const { items, more } = useMemo(() => quickResults(ws.docs ?? [], query), [ws.docs, query]);
  const scanning = !!ws.open && (ws.refreshing || !ws.scan);

  useEffect(() => {
    input.current?.focus();
    return () => {
      if (opener instanceof HTMLElement && opener !== document.body && opener.isConnected) opener.focus();
    };
  }, []);

  // Escape closes the box and goes no further; Tab stays inside it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close.current();
      } else if (e.key === "Tab" && panel.current) {
        const stops = [...panel.current.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled)")];
        e.preventDefault();
        stops[cycleFocus(stops.length, stops.indexOf(document.activeElement as HTMLElement), e.shiftKey)]?.focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  // A block body: scrollIntoView returns a promise in the webview, and an effect's return value is its cleanup.
  useEffect(() => {
    document.getElementById(`quick-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, items]);

  function pick(path: string) {
    onClose();
    onOpen(path);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => moveActive(items.length, a, e.key === "ArrowDown" ? 1 : -1));
    } else if (e.key === "Enter" && items[active]) {
      e.preventDefault();
      pick(items[active].doc.path);
    }
  }

  const status = [
    items.length === 0 && (scanning && !ws.docs ? "Scanning…" : "No documents match."),
    more > 0 && `${more.toLocaleString()} more. Keep typing to narrow the list.`,
    ws.scan?.truncated
      ? "This folder is too large to scan in full, so some documents may be missing."
      : scanning && ws.docs && "Scanning… more documents may appear.",
  ].filter(Boolean);

  return (
    <div className="quick-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section ref={panel} className="quick" role="dialog" aria-modal="true" aria-label="Quick open">
        {ws.open ? (
          <>
            <div className="quick-search">
              <Icon name="search" size={16} />
              <input
                ref={input}
                role="combobox"
                aria-label="Find a document in this workspace"
                aria-expanded="true"
                aria-controls="quick-list"
                aria-activedescendant={items[active] ? `quick-${active}` : undefined}
                aria-autocomplete="list"
                spellCheck={false}
                autoComplete="off"
                placeholder="Find a document"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                onKeyDown={onKeyDown}
              />
            </div>
            <ul id="quick-list" className="quick-list" role="listbox" aria-label="Documents">
              {items.map(({ doc, parts }, i) => (
                <li
                  key={doc.path}
                  id={`quick-${i}`}
                  className="quick-row"
                  role="option"
                  aria-selected={i === active}
                  title={doc.path}
                  onMouseMove={() => active !== i && setActive(i)}
                  onClick={() => pick(doc.path)}
                >
                  <Icon name="file" size={15} />
                  <span className="quick-path">
                    {parts.map((p, n) => (
                      <span key={n} className="quick-part" data-name={p.name} data-match={p.match}>
                        {p.text}
                      </span>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
            {status.length > 0 && (
              <p className="quick-note" role="status">
                {status.join(" ")}
              </p>
            )}
          </>
        ) : (
          <div className="quick-offer">
            <p>Quick open searches the documents of the open workspace. Open a folder to start.</p>
            <button
              ref={(el) => el?.focus()}
              className="primary"
              onClick={() => {
                onClose();
                void ws.pickFolder();
              }}
            >
              Open folder…
            </button>
          </div>
        )}
        <footer className="quick-foot">
          <span>↑↓ moves · Enter opens · Esc closes</span>
          {ws.open && <span>In {ws.open.name}</span>}
        </footer>
      </section>
    </div>
  );
}
