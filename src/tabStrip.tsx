import { useEffect, useLayoutEffect, useState, type RefObject } from "react";
import { basename } from "./Home";
import { currentEntry, type Tabs } from "./tabs";
import type { TabMenuItem } from "./TabMenu";

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
          {unsaved(path) && <span className="unsaved-dot" title="Unsaved changes" />}
          <span>{basename(path)}</span>
        </span>
      ),
      checked: t.id === shown,
      run: () => show(t.id),
    };
  });
}
