import { describe, expect, test, vi } from "vitest";
import { tabMenuItems } from "@/tabs/tabMenuItems";
import { closeTab, openTab, NO_TABS, type Tabs } from "@/tabs/tabs";
import type { TabMenuItem } from "@/ui/TabMenu";
import type { Workspaces } from "@/workspaces/useWorkspaces";

const A = "C:\\docs\\a.md";
const B = "C:\\docs\\b.md";
const C = "C:\\docs\\c.md";
const three = [A, B, C].reduce((s, p) => openTab(s, p), NO_TABS);
const workspaces = { workspaces: [], addTo: vi.fn(), createWorkspace: vi.fn() } as unknown as Workspaces;

function items(tabs: Tabs, id: number, bindings = {}) {
  const calls = { closeTab: vi.fn(async () => true), closeTabs: vi.fn(async () => {}), changeTabs: vi.fn(), onError: vi.fn() };
  const list = tabMenuItems(tabs, id, { bindings, workspaces, ...calls });
  const named = (label: string) => list.find((i): i is Extract<TabMenuItem, { run: () => void }> => i !== "separator" && i.label === label && "run" in i)!;
  return { list, named, ...calls };
}

describe("tabMenuItems", () => {
  test("lists the path items, Add to, the close items and Reopen, with separators", () => {
    const { list } = items(three, 2);
    expect(list.map((i) => (i === "separator" ? "-" : i.label))).toEqual([
      "Open containing folder",
      "Copy path",
      "Add to",
      "-",
      "Close",
      "Close others",
      "Close tabs to the right",
      "-",
      "Reopen closed tab",
    ]);
  });

  test("Close, Close others and Close tabs to the right close those tabs", () => {
    const { named, closeTab, closeTabs } = items(three, 2);
    named("Close").run();
    expect(closeTab).toHaveBeenCalledWith(2);
    named("Close others").run();
    expect(closeTabs).toHaveBeenLastCalledWith([1, 3]);
    named("Close tabs to the right").run();
    expect(closeTabs).toHaveBeenLastCalledWith([3]);
  });

  test("items with nothing to act on are disabled", () => {
    const { named } = items(three, 3);
    expect(named("Close tabs to the right").disabled).toBe(true);
    expect(named("Reopen closed tab").disabled).toBe(true);
    const one = items(openTab(NO_TABS, A), 1);
    expect(one.named("Close others").disabled).toBe(true);
  });

  test("Reopen closed tab reopens through changeTabs once a tab was closed", () => {
    const { named, changeTabs } = items(closeTab(three, 1), 2);
    expect(named("Reopen closed tab").disabled).toBe(false);
    named("Reopen closed tab").run();
    const reopened = changeTabs.mock.calls[0][0](closeTab(three, 1)) as Tabs;
    expect(reopened.tabs.map((t) => t.entries[0].path)).toEqual([A, B, C]);
  });

  test("the keys shown follow the bindings", () => {
    expect(items(three, 1).named("Close").keys).toBe("Ctrl+W");
    expect(items(three, 1, { closeTab: ["Ctrl+Alt+W"] }).named("Close").keys).toBe("Ctrl+Alt+W");
  });

  test("an unknown tab has no items", () => {
    expect(items(three, 9).list).toEqual([]);
  });
});
