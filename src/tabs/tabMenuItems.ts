import { keyLabel, type Bindings } from "@/app/shortcuts";
import { pathItems, type TabMenuItem } from "@/ui/TabMenu";
import { addToItem } from "@/workspaces/FilesPanel";
import type { Workspaces } from "@/workspaces/useWorkspaces";
import { currentEntry, otherTabIds, reopenTab, tabIdsRightOf, type Tabs } from "./tabs";

type Options = {
  bindings: Bindings;
  workspaces: Workspaces;
  /** Close a tab, and close several one after another, each saving its edits first. */
  closeTab: (id: number) => Promise<unknown>;
  closeTabs: (ids: number[]) => Promise<unknown>;
  changeTabs: (fn: (s: Tabs) => Tabs) => void;
  onError: (e: unknown) => void;
};

/** The tab menu's items for tab `id`. */
export function tabMenuItems(tabs: Tabs, id: number, { bindings, workspaces, closeTab, closeTabs, changeTabs, onError }: Options): TabMenuItem[] {
  const t = tabs.tabs.find((x) => x.id === id);
  if (!t) return [];
  const file = currentEntry(t).path;
  return [
    ...pathItems(file, onError),
    addToItem(workspaces, { kind: "document", path: file }),
    "separator",
    { label: "Close", keys: keyLabel(bindings, "closeTab"), run: () => void closeTab(id) },
    { label: "Close others", disabled: !otherTabIds(tabs, id).length, run: () => void closeTabs(otherTabIds(tabs, id)) },
    { label: "Close tabs to the right", disabled: !tabIdsRightOf(tabs, id).length, run: () => void closeTabs(tabIdsRightOf(tabs, id)) },
    "separator",
    { label: "Reopen closed tab", keys: keyLabel(bindings, "reopenTab"), disabled: !tabs.closed?.length, run: () => changeTabs(reopenTab) },
  ];
}
