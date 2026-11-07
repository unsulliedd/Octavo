import { useEffect, useLayoutEffect, useState, type PointerEvent, type RefObject } from "react";
import { useTip } from "@/app/useKeys";
import { basename } from "@/lib/paths";
import { Icon } from "@/ui/icons";
import { currentEntry, type Tabs } from "./tabs";
import type { TabMenuItem } from "@/ui/TabMenu";

/** How far a wheel turn moves the strip sideways: a vertical turn counts as sideways, a sideways one is left to the browser. */
export const wheelShift = (deltaX: number, deltaY: number) => (Math.abs(deltaY) > Math.abs(deltaX) ? deltaY : 0);

/**
 * Whether the tabs run past the end of the strip. It is re-checked when the strip is resized and when `tabCount` changes;
 * a plain vertical wheel over an overflowing strip scrolls it sideways.
 */
export function useTabOverflow(strip: RefObject<HTMLElement | null>, tabCount: number) {
  const [overflowing, setOverflowing] = useState(false);

  const measure = () => {
    const el = strip.current;
    if (el) setOverflowing(el.scrollWidth > el.clientWidth);
  };

  useLayoutEffect(measure, [tabCount]);

  useEffect(() => {
    const el = strip.current;
    if (!el) return;
    // Limitation: without ResizeObserver the strip is only re-checked when the tabs change.
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(measure);
    observer?.observe(el);
    window.addEventListener("resize", measure);
    // A wheel listener that can cancel the page's own scroll has to be non-passive, which React's onWheel is not.
    const onWheel = (e: WheelEvent) => {
      const shift = wheelShift(e.deltaX, e.deltaY);
      if (!shift || el.scrollWidth <= el.clientWidth) return;
      e.preventDefault();
      el.scrollLeft += shift;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      el.removeEventListener("wheel", onWheel);
    };
  }, [tabCount > 0]); // the strip exists only while a tab is open

  return overflowing;
}

/** The menu listing every open tab: the one shown is checked, a tab with unsaved changes carries the strip's mark. */
export function tabListItems(tabs: Tabs, shown: number | undefined, unsaved: (path: string) => boolean, show: (id: number) => void): TabMenuItem[] {
  return tabs.tabs.map((t) => {
    const path = currentEntry(t).path;
    return {
      label: (
        <span className="menu-tab">
          {unsaved(path) ? <span className="unsaved-dot" role="img" aria-label="Unsaved changes" data-tip="Unsaved changes" /> : <Icon name="markdown" size="row" />}
          <span>{basename(path)}</span>
        </span>
      ),
      checked: t.id === shown,
      run: () => show(t.id),
    };
  });
}

type Props = {
  tabs: Tabs;
  /** The id of the tab shown, if any. */
  shown: number | undefined;
  strip: RefObject<HTMLElement | null>;
  draggedTab: number | undefined;
  /** The tab whose menu is open. */
  menuTab: number | undefined;
  overflowing: boolean;
  listOpen: boolean;
  unsaved: (path: string) => boolean;
  onActivate: (id: number) => void;
  onClose: (id: number) => void;
  onMenu: (menu: { id: number; x: number; y: number }) => void;
  onStartDrag: (e: PointerEvent, id: number) => void;
  onOpenFile: () => void;
  /** Opens the list of every tab under the button's box, or closes it. */
  onToggleList: (box: DOMRect) => void;
};

/** The open documents' tabs, the button that opens a file, and the button listing every tab when they overflow. */
export function TabStrip({ tabs, shown, strip, draggedTab, menuTab, overflowing, listOpen, unsaved, onActivate, onClose, onMenu, onStartDrag, onOpenFile, onToggleList }: Props) {
  const tip = useTip();
  return (
    <>
      <nav className="tabs" aria-label="Open documents" ref={strip}>
        {tabs.tabs.map((t) => {
          const tabPath = currentEntry(t).path;
          return (
            <div
              key={t.id}
              className="tab"
              data-tip={tabPath}
              data-tab-id={t.id}
              data-dragging={draggedTab === t.id || undefined}
              data-menu={menuTab === t.id || undefined}
              onContextMenu={(e) => {
                e.preventDefault();
                onMenu({ id: t.id, x: e.clientX, y: e.clientY });
              }}
              aria-current={t.id === shown ? "page" : undefined}
              onMouseDown={(e) => {
                if (e.button === 1) e.preventDefault();
              }}
              onPointerDown={(e) => e.button === 0 && !(e.target as HTMLElement).closest(".icon-btn") && onStartDrag(e, t.id)}
              onAuxClick={(e) => e.button === 1 && onClose(t.id)}
            >
              <button className="tab-open" aria-description={tabPath} onClick={() => onActivate(t.id)}>
                {unsaved(tabPath) ? <span className="unsaved-dot" role="img" aria-label="Unsaved changes" data-tip="Unsaved changes" /> : <Icon name="markdown" size="row" />}
                <span>{basename(tabPath)}</span>
              </button>
              <button className="icon-btn small" aria-label={tip(`Close ${basename(tabPath)}`, "closeTab")} onClick={() => onClose(t.id)}>
                <Icon name="close" size="inline" />
              </button>
            </div>
          );
        })}
        <button className="icon-btn" aria-label={tip("Open file", "open")} onClick={onOpenFile}>
          <Icon name="plus" />
        </button>
      </nav>
      {overflowing && (
        <button
          className="icon-btn"
          data-menu-toggle
          aria-label="All open documents"
          aria-haspopup="menu"
          aria-expanded={listOpen}
          data-tip="All open documents"
          onClick={(e) => onToggleList(e.currentTarget.getBoundingClientRect())}
        >
          <Icon name="down" />
        </button>
      )}
    </>
  );
}
