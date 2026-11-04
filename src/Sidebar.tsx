import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { DEFAULT_SIDEBAR, MIN_SIDEBAR, SIDEBAR_KEY_STEP, sidebarWidth } from "./sidebarWidth";
import { described } from "./tooltip";

/** The window's inner width, kept up to date. */
export function useWindowWidth() {
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return windowWidth;
}

type Props = {
  /** The saved width, in pixels. */
  width: number;
  /** Missing where the width can't be changed, as in the floating panel. */
  onWidth?: (width: number) => void;
  /** Floating over the document from a hovered margin, with no handle: the margin it came from and what it is called. */
  floating?: { side: "left" | "right"; label: string };
  children: ReactNode;
};

/**
 * The sidebar and the handle on its edge. Dragging the handle or pressing the left and right arrow keys on it changes
 * the width, a double-click resets it. A window too narrow for the saved width shows less, and the width comes back as
 * the window grows.
 */
export function Sidebar({ width, onWidth, floating, children }: Props) {
  const windowWidth = useWindowWidth();
  // The width during a drag, saved when it ends.
  const [dragged, setDragged] = useState<number>();
  const drag = useRef<{ x: number; width: number }>(undefined);
  const shown = sidebarWidth(dragged ?? width, windowWidth);

  if (floating) {
    return (
      <aside className="sidebar" data-floating={floating.side} aria-label={floating.label} style={{ width: shown }}>
        {children}
      </aside>
    );
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, width: shown };
  }

  function onPointerMove(e: PointerEvent) {
    if (drag.current) setDragged(drag.current.width + e.clientX - drag.current.x);
  }

  function endDrag() {
    drag.current = undefined;
    if (dragged !== undefined) onWidth?.(shown);
    setDragged(undefined);
  }

  function onKeyDown(e: KeyboardEvent) {
    const step = e.key === "ArrowRight" ? SIDEBAR_KEY_STEP : e.key === "ArrowLeft" ? -SIDEBAR_KEY_STEP : 0;
    if (!step) return;
    e.preventDefault();
    onWidth?.(sidebarWidth(shown + step, windowWidth));
  }

  return (
    <>
      <aside className="sidebar" aria-label="Sidebar" style={{ width: shown }}>
        {children}
      </aside>
      <div
        className="sidebar-handle"
        role="separator"
        aria-orientation="vertical"
        aria-label="Sidebar width"
        aria-valuenow={shown}
        aria-valuemin={MIN_SIDEBAR}
        aria-valuemax={sidebarWidth(Infinity, windowWidth)}
        tabIndex={0}
        {...described("Drag to resize the sidebar, double-click for its usual width")}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={() => onWidth?.(DEFAULT_SIDEBAR)}
        onKeyDown={onKeyDown}
      />
    </>
  );
}
