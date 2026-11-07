import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { TabMenu } from "@/ui/TabMenu";
import { isMenuKey, readingMenuItems, readingTarget, selectAllIn, selectionIn, type ReadingTarget } from "./readingMenu";

type Open = ReadingTarget & { x: number; y: number; text: string };

/**
 * The right-click menu of the rendered document `root`. A right-click on it, or the context-menu key or Shift+F10
 * while it or nothing is focused, opens the menu; from the keyboard it opens at the selection, at the focused link
 * or at the top left of the document. `enabled` is whether the reading view is shown, so the editor and Source mode
 * keep their own menus. `failed` gets what went wrong when copying.
 */
export function useReadingMenu(root: { current: HTMLElement | null }, enabled: boolean, name: string, failed: (e: unknown) => void) {
  const [menu, setMenu] = useState<Open>();
  const opener = useRef<HTMLElement | null>(null);
  const close = useCallback(() => {
    setMenu(undefined);
    opener.current?.focus();
  }, []);

  const openAt = useCallback(
    (x: number, y: number, el: Element | null) => {
      const text = selectionIn(root.current)?.toString() ?? "";
      opener.current = document.activeElement as HTMLElement | null;
      setMenu({ x, y, text, hasSelection: text !== "", ...readingTarget(el) });
    },
    [root],
  );

  useEffect(() => {
    if (!enabled) return setMenu(undefined);
    const onKey = (e: KeyboardEvent) => {
      const doc = root.current;
      if (!doc || !isMenuKey(e) || e.defaultPrevented) return;
      if (e.target !== document.body && !(e.target instanceof Node && doc.contains(e.target))) return;
      e.preventDefault();
      const focused = document.activeElement !== doc && doc.contains(document.activeElement) ? document.activeElement : null;
      // Range boxes are missing where there is no layout.
      const at = focused?.getBoundingClientRect() ?? selectionIn(doc)?.getRangeAt(0).getBoundingClientRect?.();
      const box = doc.getBoundingClientRect();
      openAt(at?.left ?? box.left, at ? at.bottom : Math.max(box.top, 0), focused);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, root, openAt]);

  return {
    onContextMenu: (e: MouseEvent) => {
      e.preventDefault();
      openAt(e.clientX, e.clientY, e.target as Element);
    },
    menu: menu && (
      <TabMenu
        name={name}
        x={menu.x}
        y={menu.y}
        onClose={close}
        items={readingMenuItems(menu, {
          copy: () => void navigator.clipboard.writeText(menu.text).catch(failed),
          copyText: (text) => void navigator.clipboard.writeText(text).catch(failed),
          selectAll: () => root.current && selectAllIn(root.current),
        })}
      />
    ),
  };
}
