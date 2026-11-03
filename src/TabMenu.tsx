import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { Icon } from "./icons";

/** With `checked`, the item is one choice of a set, and `checked` says whether it is the current one. */
export type TabMenuItem = { label: ReactNode; keys?: string; disabled?: boolean; checked?: boolean; run: () => void } | "separator";

/** The items every menu on a document or folder has: show it in Explorer, copy its path. `failed` gets what went wrong. */
export const pathItems = (path: string, failed: (e: unknown) => void): TabMenuItem[] => [
  { label: "Open containing folder", run: () => void revealItemInDir(path).catch(failed) },
  { label: "Copy path", run: () => void navigator.clipboard.writeText(path).catch(failed) },
];

type Props = {
  /** The document the menu is for, read out as its name. */
  name: string;
  /** Where the pointer was right-clicked. */
  x: number;
  y: number;
  /** The menu ends at `y` instead of starting there. */
  above?: boolean;
  items: TabMenuItem[];
  onClose: () => void;
};

/**
 * The menu a right-click on a tab opens, at the pointer and kept inside the window. The arrow keys move between
 * the items, Home and End go to the first and last, Enter picks one; Escape or a click outside closes it. A click on
 * an element marked `data-menu-toggle` is left to that element, which closes the menu itself.
 */
export function TabMenu({ name, x, y, above, items, onClose }: Props) {
  const menu = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const box = menu.current?.getBoundingClientRect();
    if (!box) return;
    setPlace({ left: Math.max(4, Math.min(x, window.innerWidth - box.width - 4)), top: Math.max(4, Math.min(above ? y - box.height : y, window.innerHeight - box.height - 4)) });
    menu.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, [x, y, above]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => !menu.current?.contains(e.target as Node) && !(e.target as Element).closest("[data-menu-toggle]") && onClose();
    const onBlur = () => onClose();
    window.addEventListener("mousedown", onDown);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("blur", onBlur);
    };
  }, [onClose]);

  function onKeyDown(e: KeyboardEvent) {
    const buttons = [...(menu.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const focus = (n: number) => buttons[(n + buttons.length) % buttons.length]?.focus();
    if (e.key === "Escape") onClose();
    else if (e.key === "ArrowDown") focus(i + 1);
    else if (e.key === "ArrowUp") focus(i < 0 ? -1 : i - 1);
    else if (e.key === "Home") focus(0);
    else if (e.key === "End") focus(-1);
    else return;
    e.preventDefault();
    e.stopPropagation();
  }

  return (
    <div className="menu" role="menu" aria-label={name} ref={menu} style={place} onKeyDown={onKeyDown}>
      {items.map((item, i) =>
        item === "separator" ? (
          <div key={i} className="menu-separator" role="separator" />
        ) : (
          <button
            key={i}
            className="menu-item"
            role={item.checked === undefined ? "menuitem" : "menuitemradio"}
            aria-checked={item.checked}
            disabled={item.disabled}
            onClick={() => {
              onClose();
              item.run();
            }}
          >
            {item.label}
            {item.keys && <span className="menu-keys">{item.keys}</span>}
            {item.checked && <Icon name="check" size={14} />}
          </button>
        ),
      )}
    </div>
  );
}
