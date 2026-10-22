import { expect, test } from "vitest";
import {
  activate,
  activeTab,
  closeTab,
  currentEntry,
  cycle,
  dropIndex,
  fromStored,
  go,
  goHome,
  historyTarget,
  MAX_CLOSED,
  moveTab,
  NO_TABS,
  openPaths,
  openTab,
  otherTabIds,
  renamePath,
  reopenTab,
  replaceCurrent,
  samePath,
  setScroll,
  shownTab,
  tabIdsRightOf,
  toStored,
  type Tabs,
} from "./tabs";

const open = (...paths: string[]) => paths.reduce((s, p) => openTab(s, p), NO_TABS);
const activePath = (s: Tabs) => currentEntry(activeTab(s)!).path;

test("opening a document adds a tab after the active one, or switches to the tab that shows it", () => {
  let s = open("/a.md", "/b.md", "/c.md");
  expect(openPaths(s)).toEqual(["/a.md", "/b.md", "/c.md"]);
  expect(activePath(s)).toBe("/c.md");
  s = openTab(s, "/a.md");
  expect(s.tabs).toHaveLength(3);
  expect(activePath(s)).toBe("/a.md");
  s = openTab(s, "/d.md");
  expect(openPaths(s)).toEqual(["/a.md", "/d.md", "/b.md", "/c.md"]);
});

test("Windows paths match without regard to case, POSIX paths don't", () => {
  expect(samePath("C:\\Docs\\a.md", "c:\\docs\\A.md")).toBe(true);
  expect(samePath("/docs/a.md", "/docs/A.md")).toBe(false);
  const s = openTab(open("C:\\Docs\\a.md"), "c:\\docs\\A.MD");
  expect(s.tabs).toHaveLength(1);
});

test("closing activates the right neighbor, or the left one at the end", () => {
  const s = open("/a.md", "/b.md", "/c.md");
  const [a, b, c] = s.tabs.map((t) => t.id);
  expect(activePath(closeTab(activate(s, b), b))).toBe("/c.md");
  expect(activePath(closeTab(s, c))).toBe("/b.md");
  expect(activePath(closeTab(s, a))).toBe("/c.md"); // closing an inactive tab keeps the active one
  const empty = closeTab(open("/a.md"), 1);
  expect(empty.tabs).toEqual([]);
  expect(empty.active).toBeUndefined();
  expect(closeTab(s, 99)).toBe(s);
});

test("a dragged tab moves to its new place and is shown", () => {
  const s = open("/a.md", "/b.md", "/c.md");
  const [a, b, c] = s.tabs.map((t) => t.id);
  const moved = moveTab(goHome(s), b, 0);
  expect(openPaths(moved)).toEqual(["/b.md", "/a.md", "/c.md"]);
  expect(shownTab(moved)?.id).toBe(b);
  expect(openPaths(moveTab(s, a, 2))).toEqual(["/b.md", "/c.md", "/a.md"]);
  expect(openPaths(moveTab(s, a, 99))).toEqual(["/b.md", "/c.md", "/a.md"]); // past the end goes last
  expect(openPaths(moveTab(s, c, -1))).toEqual(["/c.md", "/a.md", "/b.md"]);
  expect(moveTab(s, c, 2)).toBe(s); // already there and shown
  expect(moveTab(s, 99, 0)).toBe(s);
  // The order is kept for the next launch.
  expect(openPaths(fromStored(JSON.parse(JSON.stringify(toStored(moved)))))).toEqual(["/b.md", "/a.md", "/c.md"]);
});

test("the tabs Close others and Close tabs to the right close", () => {
  const s = open("/a.md", "/b.md", "/c.md", "/d.md");
  const [a, b, c, d] = s.tabs.map((t) => t.id);
  expect(otherTabIds(s, b)).toEqual([a, c, d]);
  expect(tabIdsRightOf(s, b)).toEqual([c, d]);
  expect(tabIdsRightOf(s, d)).toEqual([]);
  expect(otherTabIds(open("/a.md"), 1)).toEqual([]);
  expect(tabIdsRightOf(s, 99)).toEqual([]);
});

test("a dragged tab goes past every other tab whose middle the pointer has passed", () => {
  const mids = [50, 150, 250]; // the other tabs, left to right
  expect(dropIndex(mids, 10)).toBe(0);
  expect(dropIndex(mids, 149)).toBe(1);
  expect(dropIndex(mids, 151)).toBe(2);
  expect(dropIndex(mids, 900)).toBe(3);
  expect(dropIndex([], 100)).toBe(0);
});

test("a closed tab reopens where it was, with its history and scroll position", () => {
  let s = open("/a.md", "/b.md", "/c.md");
  const b = s.tabs[1].id;
  s = setScroll(openTab(activate(s, b), "/b2.md", b), s.nextId, 300); // /b2.md opened from /b.md, scrolled
  const linked = s.tabs[2].id;
  s = closeTab(s, linked);
  expect(openPaths(s)).toEqual(["/a.md", "/b.md", "/c.md"]);
  s = reopenTab(goHome(s));
  expect(openPaths(s)).toEqual(["/a.md", "/b.md", "/b2.md", "/c.md"]);
  expect(shownTab(s)?.entries).toEqual([
    { path: "/b.md", scroll: 0 },
    { path: "/b2.md", scroll: 300 },
  ]);
  expect(historyTarget(s, -1)).toBe("/b.md");
});

test("reopening goes back through the closed tabs, most recent first", () => {
  let s = open("/a.md", "/b.md", "/c.md");
  const [a, , c] = s.tabs.map((t) => t.id);
  s = closeTab(closeTab(s, c), a);
  s = reopenTab(s);
  expect(openPaths(s)).toEqual(["/a.md", "/b.md"]);
  s = reopenTab(s);
  expect(openPaths(s)).toEqual(["/a.md", "/b.md", "/c.md"]);
  expect(activePath(s)).toBe("/c.md");
  expect(reopenTab(s)).toBe(s); // nothing left to reopen
});

test("reopening a document another tab shows switches to that tab", () => {
  let s = open("/a.md", "/b.md");
  s = openTab(closeTab(s, s.tabs[0].id), "/a.md");
  const reopened = reopenTab(activate(s, s.tabs[0].id));
  expect(reopened.tabs).toHaveLength(2);
  expect(activePath(reopened)).toBe("/a.md");
  expect(reopened.closed).toEqual([]);
});

test("only the latest closed tabs are kept, and none across launches", () => {
  let s = open(...Array.from({ length: MAX_CLOSED + 5 }, (_, i) => `/${i}.md`));
  for (const t of [...s.tabs]) s = closeTab(s, t.id);
  expect(s.closed).toHaveLength(MAX_CLOSED);
  expect(s.closed![s.closed!.length - 1].entries[0].path).toBe(`/${MAX_CLOSED + 4}.md`);
  expect(fromStored(JSON.parse(JSON.stringify(toStored(s)))).closed).toBeUndefined();
});

test("cycling wraps around", () => {
  const s = open("/a.md", "/b.md", "/c.md");
  expect(activePath(cycle(s, 1))).toBe("/a.md");
  expect(activePath(cycle(s, -1))).toBe("/b.md");
  expect(cycle(NO_TABS, 1)).toBe(NO_TABS);
});

test("a tab opened from a link keeps the linking tab's history; back and forward move within the tab", () => {
  let s = open("/a.md");
  s = openTab(s, "/b.md", activeTab(s)!.id);
  expect(s.tabs).toHaveLength(2);
  expect(historyTarget(s, -1)).toBe("/a.md");
  expect(historyTarget(s, 1)).toBeUndefined();
  s = go(s, -1);
  expect(activePath(s)).toBe("/a.md");
  expect(historyTarget(s, 1)).toBe("/b.md");
  // Opening from a tab that went back drops its forward entries, like a browser.
  s = openTab(s, "/c.md", activeTab(s)!.id);
  expect(activeTab(s)!.entries.map((e) => e.path)).toEqual(["/a.md", "/c.md"]);
  expect(go(open("/a.md"), -1)).toEqual(open("/a.md"));
});

test("scroll positions are kept per tab and per history entry", () => {
  let s = open("/a.md");
  const a = activeTab(s)!.id;
  s = setScroll(s, a, 120);
  s = openTab(s, "/b.md", a);
  const b = activeTab(s)!.id;
  s = setScroll(s, b, 40);
  expect(currentEntry(activeTab(s)!).scroll).toBe(40);
  s = go(s, -1);
  expect(currentEntry(activeTab(s)!)).toEqual({ path: "/a.md", scroll: 120 });
  s = activate(s, a);
  expect(currentEntry(activeTab(s)!).scroll).toBe(120);
  expect(setScroll(s, a, 120)).toBe(s);
});

test("renamePath replaces a path in every tab and history", () => {
  let s = open("docs/a.md");
  s = openTab(s, "/b.md", s.active);
  s = renamePath(s, "docs/a.md", "/home/u/docs/a.md");
  expect(s.tabs.flatMap((t) => t.entries.map((e) => e.path))).toEqual(["/home/u/docs/a.md", "/home/u/docs/a.md", "/b.md"]);
});

test("replaceCurrent changes only the tab's current document", () => {
  let s = open("/a.md");
  s = openTab(s, "/b.md", s.active);
  s = setScroll(s, s.active!, 50);
  s = replaceCurrent(s, s.active!, "/c.md");
  expect(s.tabs.map((t) => t.entries)).toEqual([
    [{ path: "/a.md", scroll: 0 }],
    [
      { path: "/a.md", scroll: 0 },
      { path: "/c.md", scroll: 50 },
    ],
  ]);
});

test("tabs survive a round trip through storage, and junk is dropped", () => {
  let s = open("/a.md", "/b.md");
  s = setScroll(s, activeTab(s)!.id, 300);
  s = activate(s, s.tabs[0].id);
  const restored = fromStored(JSON.parse(JSON.stringify(toStored(s))));
  expect(openPaths(restored)).toEqual(["/a.md", "/b.md"]);
  expect(activePath(restored)).toBe("/a.md");
  expect(currentEntry(restored.tabs[1]).scroll).toBe(300);
  expect(openPaths(openTab(restored, "/c.md"))).toEqual(["/a.md", "/c.md", "/b.md"]);

  expect(fromStored(null)).toEqual(NO_TABS);
  expect(fromStored("x")).toEqual(NO_TABS);
  const junk = fromStored({ tabs: [null, { entries: [] }, { entries: [{ path: 3 }, { path: "/x.md", scroll: -5 }], index: 7 }], active: 9 });
  expect(junk.tabs).toEqual([{ id: 1, entries: [{ path: "/x.md", scroll: 0 }], index: 0 }]);
  expect(junk.active).toBe(1);
  expect(junk.nextId).toBe(2);
});

test("the home screen shows while tabs stay open, and showing a tab leaves it", () => {
  let s = goHome(open("/a.md", "/b.md"));
  expect(shownTab(s)).toBeUndefined();
  expect(activePath(s)).toBe("/b.md");
  expect(openPaths(s)).toEqual(["/a.md", "/b.md"]);
  expect(goHome(s)).toBe(s);
  // Back and forward don't change a tab that isn't shown.
  let linked = open("/a.md");
  linked = goHome(openTab(linked, "/b.md", linked.active));
  expect(go(linked, -1)).toBe(linked);
  expect(shownTab(activate(s, s.tabs[0].id))?.id).toBe(s.tabs[0].id);
  expect(shownTab(cycle(s, 1))).toBeDefined();
  expect(shownTab(openTab(s, "/c.md"))).toBeDefined();
  expect(shownTab(openTab(s, "/a.md"))).toBeDefined();
  s = closeTab(s, s.tabs[0].id);
  expect(shownTab(s)).toBeUndefined();
  // Not stored: the next launch shows the active tab.
  expect(fromStored(JSON.parse(JSON.stringify(toStored(s)))).home).toBeUndefined();
});
