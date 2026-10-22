import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";

export type TabMenuItem = { label: string; keys?: string; disabled?: boolean; run: () => void } | "separator";

type Props = {
  /** The document the menu is for, read out as its name. */
  name: string;
  /** Where the pointer was right-clicked. */
  x: number;
  y: number;
  items: TabMenuItem[];
  onClose: () => void;
};

/**
 * The menu a right-click on a tab opens, at the pointer and kept inside the window. The arrow keys move between
 * the items, Home and End go to the first and last, Enter picks one; Escape or a click outside closes it.
 */
export function TabMenu({ name, x, y, items, onClose }: Props) {
  const menu = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const box = menu.current?.getBoundingClientRect();
    if (!box) return;
    setPlace({ left: Math.max(4, Math.min(x, window.innerWidth - box.width - 4)), top: Math.max(4, Math.min(y, window.innerHeight - box.height - 4)) });
    menu.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, [x, y]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => !menu.current?.contains(e.target as Node) && onClose();
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
    <div className="menu" role="menu" aria-label={name} ref={menu} style={place} onKeyDown={onKeyDown} onContextMenu={(e) => e.preventDefault()}>
      {items.map((item, i) =>
        item === "separator" ? (
          <div key={i} className="menu-separator" role="separator" />
        ) : (
          <button
            key={item.label}
            className="menu-item"
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              onClose();
              item.run();
            }}
          >
            {item.label}
            {item.keys && <span className="menu-keys">{item.keys}</span>}
          </button>
        ),
      )}
    </div>
  );
}
