import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { Sidebar, useWindowWidth } from "./Sidebar";
import { RAIL_WIDTH, railPlace, type Dash } from "./sidePanels";

/** How long the pointer rests on the dashes before the panel floats out, and how long it stays away before the panel goes. */
export const OPEN_DELAY = 150;
export const CLOSE_DELAY = 300;

/** Where the dashes sit, from the left of the body: in the margin beside the text or against the document's edge. `panel` is how far from that side of the body the floating panel starts. */
type Place = { x: number; margin: boolean; panel: number };

type Props = {
  /** The margin the dashes are in: the outline floats from the left or the right. */
  side: "left" | "right";
  /** What the focusable button says, for screen readers. */
  label: string;
  /** What the floating panel is called. */
  panelLabel: string;
  dashes: Dash[];
  /** The saved width of the panel. */
  width: number;
  /** Scrolls to the heading with this index. */
  onJump: (index: number) => void;
  /** The floating panel's content. */
  children: ReactNode;
};

/**
 * The column of dashes for a hidden outline, one per heading, and the panel floating over the document while the pointer
 * or focus is on either. A click on a dash goes to its heading. The dashes are hidden from screen readers; one button
 * stands for them, and Enter or Space on it opens the panel with focus in its headings. Nothing animates.
 */
export function EdgeRail({ side, label, panelLabel, dashes, width, onJump, children }: Props) {
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<Place>({ x: 0, margin: false, panel: 28 });
  const root = useRef<HTMLDivElement>(null);
  const key = useRef<HTMLButtonElement>(null);
  const timer = useRef<number>(undefined);
  const pointerIn = useRef(false);
  const focusIn = useRef(false);
  // Focus that a click moved inside does not keep the panel open; only focus moved by the keyboard does.
  const pointerFocus = useRef(false);
  const focusHeadings = useRef(false);
  const windowWidth = useWindowWidth();

  useEffect(() => () => clearTimeout(timer.current), []);

  // The dashes follow the end of the text column; with no room for them there they go to the edge, clear of the scrollbar.
  const measure = () => {
    const body = key.current?.closest(".body");
    const reader = body?.querySelector<HTMLElement>(".reader");
    if (!body || !reader) return;
    const box = body.getBoundingClientRect();
    const edges = reader.getBoundingClientRect();
    const scrollbar = reader.offsetWidth - reader.clientWidth;
    const column = reader.querySelector<HTMLElement>(".doc-column");
    const style = column && getComputedStyle(column);
    const textEdge = column && style && (side === "right" ? column.getBoundingClientRect().right - (parseFloat(style.paddingRight) || 0) : column.getBoundingClientRect().left + (parseFloat(style.paddingLeft) || 0));
    const { x, margin } = railPlace(side, textEdge ?? undefined, { left: edges.left, right: edges.right - scrollbar });
    const next: Place = { x: x - box.left, margin, panel: side === "right" ? box.right - x + 6 : x - box.left + RAIL_WIDTH + 6 };
    setPlace((p) => (p.x === next.x && p.margin === next.margin && p.panel === next.panel ? p : next));
  };
  // After every render, which covers the line width, the sidebar's saved width and a new document.
  useLayoutEffect(measure);
  useEffect(() => {
    const reader = key.current?.closest(".body")?.querySelector(".reader");
    if (!reader || typeof ResizeObserver === "undefined") return;
    const watch = new ResizeObserver(measure);
    watch.observe(reader);
    return () => watch.disconnect();
  }, [windowWidth, side]);

  // Keyboard opening moves focus into the headings once the panel is drawn.
  useEffect(() => {
    if (!open || !focusHeadings.current) return;
    focusHeadings.current = false;
    const floating = root.current?.querySelector<HTMLElement>(".sidebar");
    (floating?.querySelector<HTMLElement>(".outline a[aria-current], .outline a") ?? floating)?.focus();
  }, [open]);

  function schedule(to: boolean) {
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(to), to ? OPEN_DELAY : CLOSE_DELAY);
  }

  function enter(buttons: number) {
    pointerIn.current = true;
    measure();
    // A press held while arriving is a text selection or a drag, not a visit.
    if (!buttons) schedule(true);
  }

  function leave() {
    pointerIn.current = false;
    if (!focusIn.current) schedule(false);
  }

  function close() {
    clearTimeout(timer.current);
    setOpen(false);
  }

  function onKeyDown(e: KeyboardEvent) {
    pointerFocus.current = false;
    if (e.key !== "Escape" || !open) return;
    e.preventDefault();
    e.stopPropagation();
    close();
    key.current?.focus();
  }

  return (
    <div
      ref={root}
      className="edge"
      style={{ [side === "right" ? "--panel-right" : "--panel-left"]: `${place.panel}px` } as CSSProperties}
      onPointerEnter={(e) => enter(e.buttons)}
      onPointerLeave={leave}
      onPointerDown={() => (pointerFocus.current = true)}
      onPointerUp={() => (pointerFocus.current = false)}
      onPointerCancel={() => (pointerFocus.current = false)}
      onFocus={() => {
        focusIn.current = !pointerFocus.current;
        if (focusIn.current) clearTimeout(timer.current);
      }}
      onBlur={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        focusIn.current = false;
        if (!pointerIn.current) schedule(false);
      }}
      onKeyDown={onKeyDown}
    >
      <div className="edge-place" data-side={side} data-margin={place.margin || undefined} style={{ left: place.x }}>
        <div className="edge-rail" aria-hidden="true">
          {dashes.map((d) => (
            <span key={d.index} className="dash-row" data-tip={d.text} onClick={() => onJump(d.index)}>
              <span className="dash" data-active={d.active || undefined} style={{ width: d.w }} />
            </span>
          ))}
        </div>
        <button
          ref={key}
          className="edge-key"
          aria-label={label}
          aria-expanded={open}
          onClick={() => {
            if (open) return close();
            focusHeadings.current = true;
            clearTimeout(timer.current);
            setOpen(true);
          }}
        />
      </div>
      {open && (
        <Sidebar floating={{ side, label: panelLabel }} width={width}>
          {children}
        </Sidebar>
      )}
    </div>
  );
}
