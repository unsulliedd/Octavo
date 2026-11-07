import { useCallback, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { useTabOverflow } from "./tabStrip";
import { dropIndex, moveTab, type Tabs } from "./tabs";

/** How far the pointer moves on a pressed tab before the tab is dragged instead of clicked, in pixels. */
const TAB_DRAG_START = 5;

/** The tab strip's state: the tab being dragged, the tab menu, the list of every tab, and whether the strip overflows. */
export function useTabStrip(tabs: Tabs, changeTabs: (fn: (s: Tabs) => Tabs) => void, tabStrip: RefObject<HTMLElement | null>) {
  // The tab being dragged to a new place in the strip.
  const [draggedTab, setDraggedTab] = useState<number>();
  // The tab a right-click menu is open for, and where the pointer was.
  const [tabMenu, setTabMenu] = useState<{ id: number; x: number; y: number }>();
  /** The menu listing every tab, open from the button at the end of an overflowing strip. */
  const [tabList, setTabList] = useState<{ x: number; y: number }>();
  const tabsOverflow = useTabOverflow(tabStrip, tabs.tabs.length);

  /**
   * Dragging a tab, from a press on it: once the pointer has moved a few pixels, the tab is shown and moves past
   * every other tab whose middle the pointer passes, so the others make room. Releasing keeps the new order;
   * Escape puts the tab back and shows what was shown before.
   */
  function startTabDrag(e: ReactPointerEvent, id: number) {
    const startX = e.clientX;
    const from = tabs.tabs.findIndex((t) => t.id === id);
    const { active, home } = tabs;
    let dragging = false;
    const move = (ev: PointerEvent) => {
      if (!dragging && Math.abs(ev.clientX - startX) < TAB_DRAG_START) return;
      dragging = true;
      setDraggedTab(id);
      const others = [...(tabStrip.current?.querySelectorAll<HTMLElement>("[data-tab-id]") ?? [])].filter((el) => el.dataset.tabId !== String(id));
      const mids = others.map((el) => {
        const r = el.getBoundingClientRect();
        return r.left + r.width / 2;
      });
      changeTabs((s) => moveTab(s, id, dropIndex(mids, ev.clientX)));
    };
    const key = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape") return;
      ev.preventDefault();
      ev.stopPropagation();
      if (dragging) changeTabs((s) => ({ ...moveTab(s, id, from), active, home }));
      end();
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("keydown", key, true);
      setDraggedTab(undefined);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("keydown", key, true);
  }

  const closeTabMenu = useCallback(() => setTabMenu(undefined), []);
  const closeTabList = useCallback(() => setTabList(undefined), []);

  return { draggedTab, tabMenu, setTabMenu, tabList, setTabList, tabsOverflow, startTabDrag, closeTabMenu, closeTabList };
}
