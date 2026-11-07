import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { watchBrokenImages } from "@/files/images";
import type { Doc } from "@/files/useDocuments";
import { dirname, joinPath, MD, safeDecode } from "@/lib/paths";
import { loadTableWidths, save, type Prefs } from "@/settings/storage";
import type { SourceEditor } from "@/source/sourceEditor";
import { currentEntry, type Tab } from "@/tabs/tabs";
import { widenBlocks } from "./breakout";
import { addOpenButtons, largeContent, type LargeContent } from "./largeView";
import { renderMermaid } from "./renderDoc";
import { anchorAt, scrollTopFor, type Anchor } from "./scrollAnchor";
import { outlineDashes } from "./sidePanels";
import { linkTarget } from "./svgLinks";
import { addResizeHandles, applyWidths, headersOf } from "./tableResize";
import { savedWidths, withWidths, type Widths } from "./tableWidths";

export type Heading = { id: string; text: string; level: number };

type Options = {
  /** The reading view's or the editor's document element, the reading area, and the tab strip. */
  article: RefObject<HTMLElement | null>;
  scroller: RefObject<HTMLElement | null>;
  tabStrip: RefObject<HTMLElement | null>;
  sourceEditor: RefObject<SourceEditor | undefined>;
  sourceHeadingStarts: RefObject<number[]>;
  prefs: Prefs;
  dark: boolean;
  tab: Tab | undefined;
  path: string | undefined;
  doc: Doc | undefined;
  /** The HTML the reading view shows: the edits once rendered, else the file. */
  shownHtml: string | undefined;
  editing: boolean;
  source: boolean;
  editorReady: boolean;
  editorShown: { key: string; root: HTMLElement } | undefined;
  /** Where a reloaded document stays scrolled to. */
  keepScroll: RefObject<number | undefined>;
  saveScrollSoon: () => void;
  openPath: (path: string, from?: number) => unknown;
};

/**
 * What the reading area shows around the document: its outline, word count, find, links, the large view,
 * table widths, and the scroll position across tabs and views.
 */
export function useReadingView(o: Options) {
  const { article, scroller, tabStrip, sourceEditor, sourceHeadingStarts, prefs, dark, tab, path, doc, shownHtml, editing, source, editorReady, editorShown, keepScroll } = o;
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [activeId, setActiveId] = useState<string>();
  const [words, setWords] = useState(0);
  // The diagram, image or table open large over the window.
  const [large, setLarge] = useState<LargeContent>();
  const [find, setFind] = useState({ open: false, query: "", focusKey: 0 });
  // Counts finished renders of the document (after diagrams), so find searches the final DOM.
  const [rendered, setRendered] = useState(0);
  // Column widths set by hand in the reading view, by file and table.
  const tableWidths = useRef(loadTableWidths());
  const pendingAnchor = useRef<Anchor>(undefined);

  /** Where the view is, relative to the headings of what it shows (reading view, editor or source). */
  function headingTops() {
    const sc = scroller.current;
    const root = article.current;
    if (!sc) return [];
    const base = sc.getBoundingClientRect().top - sc.scrollTop;
    if (source) return sourceEditor.current?.headingTops().map((top) => top - base) ?? [];
    if (!root) return [];
    return [...root.querySelectorAll("h1, h2, h3, h4, h5, h6")].map((h) => h.getBoundingClientRect().top - base);
  }

  /** The outline of the source: its headings down to level 4, by where each starts in the text. */
  function showSourceHeadings() {
    const found = sourceEditor.current?.headings().filter((h) => h.level <= 4) ?? [];
    sourceHeadingStarts.current = found.map((h) => h.from);
    setHeadings(found.map((h, i) => ({ id: `source-heading-${i}`, text: h.text, level: h.level })));
  }
  const currentAnchor = () => anchorAt(headingTops(), scroller.current?.scrollTop ?? 0, scroller.current?.scrollHeight ?? 0);
  function restoreAnchor() {
    const sc = scroller.current;
    if (!sc || !pendingAnchor.current) return;
    sc.scrollTop = scrollTopFor(pendingAnchor.current, headingTops(), sc.scrollHeight);
    pendingAnchor.current = undefined;
  }

  /** Opens the find bar, or focuses it again; a one-line selection becomes the query. */
  function openFind() {
    if (!doc) return;
    const selected = getSelection()?.toString().trim() ?? "";
    const seed = selected && !selected.includes("\n") && selected.length <= 200 ? selected : undefined;
    setFind((f) => ({ open: true, query: seed ?? f.query, focusKey: f.focusKey + 1 }));
  }

  const closeFind = useCallback(() => setFind((f) => ({ ...f, open: false })), []);

  // Remembers a table's column widths, from the reading view or the large view.
  const storeWidths = (file: string, index: number, headers: string[], widths: Widths) => {
    tableWidths.current = withWidths(tableWidths.current, file, index, headers, widths);
    save("tableWidths", tableWidths.current);
  };

  // Column widths set by hand apply, and tables and code blocks wider than the text column grow beside it.
  // This runs before the scroll position is restored, since it changes how tall the document is, and the
  // widening again when the reading area's width changes.
  useLayoutEffect(() => {
    const root = article.current;
    const area = scroller.current;
    const file = doc?.path;
    if (!root || !area || !file || editing || shownHtml === undefined) return;
    const tables = [...root.querySelectorAll("table")];
    tables.forEach((table, i) => {
      const widths = savedWidths(tableWidths.current, file, i, headersOf(table));
      if (widths) applyWidths(table, widths);
    });
    const stopResizing = addResizeHandles(root, (table, widths) => {
      storeWidths(file, tables.indexOf(table), headersOf(table), widths);
      widenBlocks(root, area, prefs.wideBlocks);
    });
    widenBlocks(root, area, prefs.wideBlocks);
    let widths = `${area.clientWidth}:${root.clientWidth}`;
    const observer = new ResizeObserver(() => {
      const next = `${area.clientWidth}:${root.clientWidth}`;
      if (next === widths) return;
      widths = next;
      widenBlocks(root, area, prefs.wideBlocks);
    });
    observer.observe(area);
    observer.observe(root);
    return () => {
      observer.disconnect();
      stopResizing();
    };
  }, [shownHtml, editing, dark, doc?.path, prefs.size, prefs.font, prefs.width, prefs.wideBlocks]);

  // Buttons that open tables, and with the reading settings' option diagrams and images, large. Added again once
  // the diagrams are drawn, since they come after the rest of the document.
  useLayoutEffect(() => {
    const root = article.current;
    if (!root || editing || shownHtml === undefined) return;
    return addOpenButtons(root, prefs.openLarge !== "click");
  }, [shownHtml, editing, rendered, prefs.openLarge]);

  // Back in a tab, or switching tabs, returns to where that document was scrolled to.
  const entryKey = tab && doc ? `${tab.id}:${tab.index}:${doc.path}` : undefined;
  useLayoutEffect(() => {
    if (tab && entryKey) scroller.current?.scrollTo(0, currentEntry(tab).scroll);
    tabStrip.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [entryKey]);

  // After switching between reading and editing, the reading view returns to the same place.
  useLayoutEffect(() => {
    if (!editing && !source && shownHtml) restoreAnchor();
  }, [editing, source, shownHtml]);

  // The editor replaces the reading view once it has loaded, at the same place.
  useLayoutEffect(() => {
    if (!editorReady || !editorShown) return;
    article.current = editorShown.root;
    restoreAnchor();
  }, [editorReady, editorShown]);

  // A reloaded document stays where it was scrolled to, also after its diagrams are drawn again.
  useLayoutEffect(() => {
    if (keepScroll.current !== undefined) scroller.current?.scrollTo(0, keepScroll.current);
  }, [doc]);

  // After each render of the document (new file, reload, edits or theme switch): diagrams, outline, word count.
  useEffect(() => {
    const root = article.current;
    if (!doc || !root) return;
    if (editing) {
      // The editor's headings have no ids; the outline finds them by position while editing.
      const found = [...root.querySelectorAll<HTMLElement>("h1, h2, h3, h4")];
      if (editorReady) setHeadings(found.map((h, i) => ({ id: `editor-heading-${i}`, text: h.textContent ?? "", level: Number(h.tagName[1]) })));
      return;
    }
    const stopWatchingImages = watchBrokenImages(root);
    renderMermaid(root, dark).finally(() => {
      if (keepScroll.current !== undefined) scroller.current?.scrollTo(0, keepScroll.current);
      keepScroll.current = undefined;
      setRendered((n) => n + 1);
    });
    const found = [...root.querySelectorAll<HTMLElement>("h1[id], h2[id], h3[id], h4[id]")];
    setHeadings(found.map((h) => ({ id: h.id, text: h.textContent ?? "", level: Number(h.tagName[1]) })));
    setActiveId(found[0]?.id);
    const properties = root.querySelector(".doc-properties, .doc-properties-yaml")?.textContent ?? "";
    setWords((root.textContent ?? "").slice(properties.length).split(/\s+/).filter(Boolean).length);
    return stopWatchingImages;
  }, [doc, shownHtml, dark, editing, editorReady]);

  // The outline highlights the last heading that has scrolled past the top of the reading area.
  const onScroll = useCallback(() => {
    o.saveScrollSoon();
    const main = scroller.current;
    if (!main || !headings.length) return;
    const top = main.getBoundingClientRect().top + 96;
    let current = headings[0].id;
    for (const h of headings) {
      const el = document.getElementById(h.id);
      if (el && el.getBoundingClientRect().top <= top) current = h.id;
      else break;
    }
    setActiveId(current);
  }, [headings]);

  // The large view closes when another document is shown.
  useEffect(() => setLarge(undefined), [path, tab?.id]);

  // Links never navigate the webview: fragments scroll, URLs go to the browser, .md links open here. An open button
  // opens its table, diagram or image large; so does a click on a diagram or an image that isn't a link, when the
  // reading settings say so.
  function onDocClick(e: React.MouseEvent) {
    const copy = (e.target as HTMLElement).closest<HTMLButtonElement>(".code-copy");
    if (copy) {
      const code = copy.closest(".code-block")?.querySelector("pre")?.textContent ?? "";
      navigator.clipboard.writeText(code).then(
        () => (copy.textContent = "Copied"),
        () => (copy.textContent = "Copy failed"),
      );
      setTimeout(() => (copy.textContent = "Copy"), 1500);
      return;
    }
    const opened = article.current && largeContent(e.target as Element, article.current, {
        editing,
        selecting: window.getSelection()?.isCollapsed === false,
        click: prefs.openLarge !== "button",
      });
    if (opened) {
      e.preventDefault();
      setLarge(opened);
      return;
    }
    const href = linkTarget(e.target as Element);
    if (href === undefined || !doc) return;
    e.preventDefault();
    if (href) followLink(href);
  }

  /** Fragments scroll, URLs go to the browser, .md links open here. */
  function followLink(href: string) {
    if (!doc) return;
    if (href.startsWith("#")) {
      document.getElementById(safeDecode(href.slice(1)))?.scrollIntoView();
    } else if (/^(https?|mailto):/i.test(href)) {
      openUrl(href);
    } else {
      const file = safeDecode(href.split("#")[0]);
      if (MD.test(file)) o.openPath(joinPath(dirname(doc.path), file), tab?.id);
    }
  }

  const headingDashes = useMemo(() => outlineDashes(headings, activeId), [headings, activeId]);

  /** Scrolls to the heading with this index in the outline: in the reading view, the editor or the source. */
  const goToHeading = (i: number) => {
    if (source) return void sourceEditor.current?.reveal(sourceHeadingStarts.current[i]);
    // The editor's headings have no ids; they are in the same order.
    const target = editing ? article.current?.querySelectorAll("h1, h2, h3, h4")[i] : document.getElementById(headings[i].id);
    target?.scrollIntoView();
  };

  return {
    headings,
    activeId,
    words,
    rendered,
    large,
    setLarge,
    find,
    setFind,
    pendingAnchor,
    currentAnchor,
    restoreAnchor,
    showSourceHeadings,
    storeWidths,
    onScroll,
    onDocClick,
    followLink,
    goToHeading,
    openFind,
    closeFind,
    headingDashes,
  };
}
