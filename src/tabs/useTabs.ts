import { useRef, useState, type RefObject } from "react";
import { loadOpenWorkspace, loadTabs, save, tabsKey } from "@/settings/storage";
import { currentEntry, go as goInTab, openTab, setScroll, shownTab, toStored, type Tabs } from "./tabs";

/** The open tabs and their history, with where each document was scrolled to in the reading area `scroller`. */
export function useTabs(scroller: RefObject<HTMLElement | null>) {
  const [tabs, setTabs] = useState<Tabs>(() => loadTabs(loadOpenWorkspace()));
  // The tab sets of the workspaces left since launch, by workspace id; these keep what isn't stored, such as closed tabs.
  const tabSets = useRef(new Map<string | undefined, Tabs>());

  // No tab while the home screen shows, even with tabs open.
  const tab = shownTab(tabs);
  const path = tab && currentEntry(tab).path;

  /** Changes the tabs, first remembering where the shown document is scrolled to. */
  function changeTabs(fn: (s: Tabs) => Tabs) {
    const top = scroller.current?.scrollTop;
    setTabs((s) => fn(s.active !== undefined && top !== undefined ? setScroll(s, s.active, top) : s));
  }

  const go = (step: number) => changeTabs((s) => goInTab(s, step));

  // The scroll position is saved shortly after scrolling stops, so it survives a restart.
  const scrollSave = useRef<number>(undefined);
  const saveScrollSoon = () => {
    clearTimeout(scrollSave.current);
    scrollSave.current = window.setTimeout(() => {
      const top = scroller.current?.scrollTop;
      if (top !== undefined) setTabs((s) => (s.active === undefined ? s : setScroll(s, s.active, top)));
    }, 400);
  };

  /** Keeps these tabs for workspace switches and the next launch, and shows those of workspace `id`, with `carry` opened in them. */
  function keepTabSet(id?: string, carry?: string) {
    changeTabs((s) => {
      tabSets.current.set(s.workspace, s);
      save(tabsKey(s.workspace), toStored(s));
      const next = tabSets.current.get(id) ?? loadTabs(id);
      return carry ? openTab(next, carry) : next;
    });
  }

  return { tabs, setTabs, changeTabs, go, tab, path, saveScrollSoon, keepTabSet };
}
