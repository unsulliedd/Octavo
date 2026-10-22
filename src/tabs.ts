// Open documents as tabs. Each tab has its own back/forward history, and every history entry keeps its
// scroll position. All functions return a new state and leave the old one unchanged.

export type Entry = { path: string; scroll: number };
export type Tab = { id: number; entries: Entry[]; index: number };
/** A closed tab, kept so it can be reopened: its history and the place it had in the tab strip. */
export type ClosedTab = { entries: Entry[]; index: number; at: number };
/**
 * `home` shows the home screen while tabs stay open; showing any tab leaves it. `closed` holds the tabs closed
 * since launch, the most recent last.
 */
export type Tabs = { tabs: Tab[]; active?: number; nextId: number; home?: boolean; closed?: ClosedTab[] };

/** How many closed tabs can be reopened. */
export const MAX_CLOSED = 20;

export const NO_TABS: Tabs = { tabs: [], nextId: 1 };

/** Windows paths ignore case; "C:\Docs\a.md" and "c:\docs\A.md" are the same file. */
export function samePath(a: string, b: string) {
  return /^[a-z]:[\\/]|\\/i.test(a) ? a.toLowerCase() === b.toLowerCase() : a === b;
}

export const currentEntry = (tab: Tab) => tab.entries[tab.index];
export const activeTab = (s: Tabs) => s.tabs.find((t) => t.id === s.active);

/** The tab whose document is shown: none while the home screen is. */
export const shownTab = (s: Tabs) => (s.home ? undefined : activeTab(s));

/** Shows the home screen; the tabs stay open and the active tab stays active. */
export const goHome = (s: Tabs): Tabs => (s.home ? s : { ...s, home: true });

/** The tab showing `path`, if any. */
export const tabFor = (s: Tabs, path: string) => s.tabs.find((t) => samePath(currentEntry(t).path, path));

const update = (s: Tabs, id: number | undefined, fn: (tab: Tab) => Tab): Tabs => ({
  ...s,
  tabs: s.tabs.map((t) => (t.id === id ? fn(t) : t)),
});

/**
 * Switches to the tab showing `path`, or opens it in a new tab right after the active one.
 * A tab opened from a link (`from`) starts with that tab's back history, so Back returns to the linking document.
 */
export function openTab(s: Tabs, path: string, from?: number): Tabs {
  const existing = tabFor(s, path);
  if (existing) return { ...s, active: existing.id, home: false };
  const source = s.tabs.find((t) => t.id === from);
  const entries = [...(source ? source.entries.slice(0, source.index + 1) : []), { path, scroll: 0 }];
  const tab: Tab = { id: s.nextId, entries, index: entries.length - 1 };
  const at = s.tabs.findIndex((t) => t.id === s.active) + 1 || s.tabs.length;
  return { ...s, tabs: [...s.tabs.slice(0, at), tab, ...s.tabs.slice(at)], active: tab.id, nextId: s.nextId + 1, home: false };
}

export const activate = (s: Tabs, id: number): Tabs => (s.tabs.some((t) => t.id === id) ? { ...s, active: id, home: false } : s);

/**
 * Closes a tab and keeps it for `reopenTab`. Closing the active tab activates its right neighbor, or the left one
 * at the end.
 */
export function closeTab(s: Tabs, id: number): Tabs {
  const i = s.tabs.findIndex((t) => t.id === id);
  if (i < 0) return s;
  const { entries, index } = s.tabs[i];
  const closed = [...(s.closed ?? []), { entries, index, at: i }].slice(-MAX_CLOSED);
  const tabs = s.tabs.filter((t) => t.id !== id);
  const active = s.active === id ? tabs[Math.min(i, tabs.length - 1)]?.id : s.active;
  return { ...s, tabs, active, closed };
}

/**
 * Reopens the most recently closed tab where it was, with its history and scroll positions, and shows it. When
 * another tab already shows its document, that tab is shown instead.
 */
export function reopenTab(s: Tabs): Tabs {
  const last = s.closed?.[s.closed.length - 1];
  if (!last) return s;
  const closed = s.closed!.slice(0, -1);
  const existing = tabFor(s, last.entries[last.index].path);
  if (existing) return { ...s, active: existing.id, home: false, closed };
  const tab: Tab = { id: s.nextId, entries: last.entries, index: last.index };
  const at = Math.min(last.at, s.tabs.length);
  return { ...s, tabs: [...s.tabs.slice(0, at), tab, ...s.tabs.slice(at)], active: tab.id, nextId: s.nextId + 1, home: false, closed };
}

/** Moves tab `id` to place `to` among the other tabs (0 is first) and shows it. */
export function moveTab(s: Tabs, id: number, to: number): Tabs {
  const i = s.tabs.findIndex((t) => t.id === id);
  if (i < 0) return s;
  const rest = s.tabs.filter((t) => t.id !== id);
  const at = Math.max(0, Math.min(to, rest.length));
  if (at === i && s.active === id && !s.home) return s;
  return { ...s, tabs: [...rest.slice(0, at), s.tabs[i], ...rest.slice(at)], active: id, home: false };
}

/** Where a dragged tab goes with the pointer at `x`: past every other tab whose middle (`mids`, left to right) is left of it. */
export const dropIndex = (mids: number[], x: number) => mids.filter((m) => m < x).length;

/** Activates the tab `step` places away from the active one, wrapping around. */
export function cycle(s: Tabs, step: number): Tabs {
  const n = s.tabs.length;
  if (!n) return s;
  const i = s.tabs.findIndex((t) => t.id === s.active);
  return { ...s, active: s.tabs[(((i + step) % n) + n) % n].id, home: false };
}

/** The path Back (-1) or Forward (1) would show in the active tab, if there is one. */
export function historyTarget(s: Tabs, step: number) {
  const tab = activeTab(s);
  return tab?.entries[tab.index + step]?.path;
}

/** Moves through the active tab's history. */
export function go(s: Tabs, step: number): Tabs {
  if (s.home || !historyTarget(s, step)) return s;
  return update(s, s.active, (t) => ({ ...t, index: t.index + step }));
}

/** Remembers the scroll position of a tab's current document. */
export function setScroll(s: Tabs, id: number, scroll: number): Tabs {
  const tab = s.tabs.find((t) => t.id === id);
  if (!tab || currentEntry(tab).scroll === scroll) return s;
  return update(s, id, (t) => ({ ...t, entries: t.entries.map((e, i) => (i === t.index ? { ...e, scroll } : e)) }));
}

/** Replaces `path` everywhere it is shown, for example after the file was read under its full path. */
export function renamePath(s: Tabs, from: string, to: string): Tabs {
  if (from === to) return s;
  return { ...s, tabs: s.tabs.map((t) => ({ ...t, entries: t.entries.map((e) => (e.path === from ? { ...e, path: to } : e)) })) };
}

/** Shows `path` in place of the tab's current document, keeping its history and scroll position (Save As). */
export function replaceCurrent(s: Tabs, id: number, path: string): Tabs {
  return update(s, id, (t) => ({ ...t, entries: t.entries.map((e, i) => (i === t.index ? { ...e, path } : e)) }));
}

/** Every path a tab currently shows. */
export const openPaths = (s: Tabs) => s.tabs.map((t) => currentEntry(t).path);

/** Tabs as stored between launches: history and scroll positions included, ids renumbered. */
export function toStored(s: Tabs) {
  return { tabs: s.tabs.map((t) => ({ entries: t.entries, index: t.index })), active: s.tabs.findIndex((t) => t.id === s.active) };
}

/** Restores stored tabs, dropping anything malformed. */
export function fromStored(raw: unknown): Tabs {
  const stored = raw as { tabs?: unknown; active?: unknown } | null;
  if (!stored || !Array.isArray(stored.tabs)) return NO_TABS;
  const tabs: Tab[] = [];
  for (const t of stored.tabs as { entries?: unknown; index?: unknown }[]) {
    if (!t || !Array.isArray(t.entries)) continue;
    const entries = (t.entries as Partial<Entry>[])
      .filter((e) => e && typeof e.path === "string" && e.path)
      .map((e) => ({ path: e.path as string, scroll: typeof e.scroll === "number" && e.scroll > 0 ? e.scroll : 0 }));
    if (!entries.length) continue;
    const index = typeof t.index === "number" ? Math.min(Math.max(Math.trunc(t.index), 0), entries.length - 1) : entries.length - 1;
    tabs.push({ id: tabs.length + 1, entries, index });
  }
  const i = typeof stored.active === "number" ? stored.active : 0;
  return { tabs, active: tabs[Math.min(Math.max(i, 0), tabs.length - 1)]?.id, nextId: tabs.length + 1 };
}
