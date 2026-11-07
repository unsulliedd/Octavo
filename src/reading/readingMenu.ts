// The right-click menu of the reading view: which items it has, and what they act on.
import type { TabMenuItem } from "@/ui/TabMenu";

/** What the right-click or the key landed on. */
export type ReadingTarget = {
  hasSelection: boolean;
  /** The `href` of the link under the pointer, as written in the document. */
  link?: string;
  /** The `src` of the image under the pointer, as written in the document. */
  image?: string;
};

export type ReadingActions = {
  /** Copies the text that was selected when the menu opened. */
  copy: () => void;
  selectAll: () => void;
  copyText: (text: string) => void;
};

/** The menu's items for `target`; a link or an image adds its address above Copy and Select all. */
export function readingMenuItems({ hasSelection, link, image }: ReadingTarget, act: ReadingActions): TabMenuItem[] {
  const addresses: TabMenuItem[] = [];
  if (link) addresses.push({ label: "Copy link address", run: () => act.copyText(link) });
  if (image) addresses.push({ label: "Copy image address", run: () => act.copyText(image) });
  return [
    ...addresses,
    ...(addresses.length ? (["separator"] as const) : []),
    { label: "Copy", keys: "Ctrl+C", disabled: !hasSelection, run: act.copy },
    { label: "Select all", keys: "Ctrl+A", run: act.selectAll },
  ];
}

/** The link and the image `el` is, or is inside. A link without an address has nothing to copy. */
export function readingTarget(el: Element | null): Pick<ReadingTarget, "link" | "image"> {
  const link = el?.closest("a")?.getAttribute("href") || undefined;
  const img = el?.closest("img");
  // `data-src` is the image as written; `src` is what the webview loads, which for a local file is a rewritten URL.
  return { link, image: (img?.getAttribute("data-src") ?? img?.getAttribute("src")) || undefined };
}

/** The selected range, when it lies inside `root`. */
export function selectionIn(root: Element | null) {
  const s = window.getSelection();
  return root && s && s.rangeCount && !s.isCollapsed && root.contains(s.getRangeAt(0).commonAncestorContainer) ? s : undefined;
}

/** Selects the text of `root` only, not the rest of the window. */
export function selectAllIn(root: Element) {
  window.getSelection()?.selectAllChildren(root);
}

/** The context-menu key, or Shift+F10. */
export const isMenuKey = (e: Pick<KeyboardEvent, "key" | "shiftKey">) => e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey);
