import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { Icon } from "./icons";

/**
 * With `checked`, the item is one choice of a set, and `checked` says whether it is the current one; with `checkbox`
 * too, it is on or off by itself. With `submenu`, the item opens a menu of its own beside it, one level deep.
 */
export type TabMenuItem =
  | { label: ReactNode; keys?: string; disabled?: boolean; checked?: boolean; checkbox?: boolean; run: () => void; submenu?: undefined }
  | { label: string; disabled?: boolean; checked?: undefined; submenu: TabMenuItem[] }
  | "separator";

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

/** The buttons of the menu `list` itself, not those of a submenu inside it, that can be pressed. */
const buttonsOf = (list: Element) => [...list.querySelectorAll<HTMLButtonElement>(":scope > button:not(:disabled), :scope > .menu-sub > button:not(:disabled)")];

/** Where a submenu of `box`'s size goes beside `item`: to its right, or to its left when there is no room, kept inside the window. */
export function submenuPlace(item: DOMRect, box: { width: number; height: number }, width = window.innerWidth, height = window.innerHeight) {
  const right = item.right + 4;
  const left = right + box.width <= width - 4 ? right : item.left - box.width - 4;
  // The first item lines up with the item that opened it: the menu's border and padding sit above it.
  return { left: Math.max(4, left), top: Math.max(4, Math.min(item.top - 5, height - box.height - 4)) };
}

/**
 * The menu a right-click on a tab opens, at the pointer and kept inside the window. The arrow keys move between
 * the items, Home and End go to the first and last, Enter picks one; Escape or a click outside closes it. A click on
 * an element marked `data-menu-toggle` is left to that element, which closes the menu itself. An item with a submenu
 * opens it on hover, a click, Right or Enter; in the submenu, Left or Escape closes it alone.
 */
export function TabMenu({ name, x, y, above, items, onClose }: Props) {
  const menu = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState({ left: x, top: y });
  // The submenu open, by the index of its item, and whether it takes the focus.
  const [sub, setSub] = useState<{ at: number; focus: boolean }>();
  const [subPlace, setSubPlace] = useState<{ left: number; top: number }>();
  const subMenu = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    const box = menu.current?.getBoundingClientRect();
    if (!box) return;
    setPlace({ left: Math.max(4, Math.min(x, window.innerWidth - box.width - 4)), top: Math.max(4, Math.min(above ? y - box.height : y, window.innerHeight - box.height - 4)) });
    menu.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, [x, y, above]);

  useLayoutEffect(() => {
    if (!sub || !subMenu.current || !trigger.current) return;
    setSubPlace(submenuPlace(trigger.current.getBoundingClientRect(), subMenu.current.getBoundingClientRect()));
    if (sub.focus) buttonsOf(subMenu.current)[0]?.focus();
  }, [sub]);

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

  const openSub = (at: number, focus: boolean) => setSub((open) => (open?.at === at && !focus ? open : { at, focus }));
  function closeSub() {
    setSub(undefined);
    trigger.current?.focus();
  }

  function onKeyDown(e: KeyboardEvent) {
    const active = document.activeElement as HTMLElement | null;
    const list = active?.closest<HTMLElement>('[role="menu"]') ?? menu.current;
    if (!list) return;
    const inSub = list !== menu.current;
    const buttons = buttonsOf(list);
    const i = buttons.indexOf(active as HTMLButtonElement);
    const focus = (n: number) => {
      if (!inSub) setSub(undefined);
      buttons[(n + buttons.length) % buttons.length]?.focus();
    };
    const opens = !inSub && active?.dataset.submenu !== undefined;
    if (e.key === "Escape") inSub ? closeSub() : onClose();
    else if (e.key === "ArrowLeft" && inSub) closeSub();
    else if ((e.key === "ArrowRight" || e.key === "Enter") && opens) openSub(Number(active!.dataset.submenu), true);
    else if (e.key === "ArrowDown") focus(i + 1);
    else if (e.key === "ArrowUp") focus(i < 0 ? -1 : i - 1);
    else if (e.key === "Home") focus(0);
    else if (e.key === "End") focus(-1);
    else return;
    e.preventDefault();
    e.stopPropagation();
  }

  const render = (list: TabMenuItem[], top: boolean) =>
    list.map((item, i) => {
      if (item === "separator") return <div key={i} className="menu-separator" role="separator" />;
      if (item.submenu) {
        if (!top) return null;
        const open = sub?.at === i;
        return (
          <div key={i} className="menu-sub">
            <button
              ref={open ? trigger : undefined}
              className="menu-item"
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={open}
              data-submenu={i}
              disabled={item.disabled}
              // A click from the keyboard (Space) moves the focus in, as Right and Enter do.
              onClick={(e) => openSub(i, e.detail === 0)}
              onMouseEnter={() => openSub(i, false)}
            >
              {item.label}
              <Icon name="forward" size="inline" />
            </button>
            {open && (
              // Placed before it is painted; it can't be hidden until then, or it couldn't take the focus.
              <div className="menu" role="menu" aria-label={item.label} ref={subMenu} style={subPlace}>
                {render(item.submenu, false)}
              </div>
            )}
          </div>
        );
      }
      return (
        <button
          key={i}
          className="menu-item"
          role={item.checked === undefined ? "menuitem" : item.checkbox ? "menuitemcheckbox" : "menuitemradio"}
          aria-checked={item.checked}
          disabled={item.disabled}
          onMouseEnter={top ? () => setSub(undefined) : undefined}
          onClick={() => {
            onClose();
            item.run();
          }}
        >
          {item.label}
          {item.keys && <span className="menu-keys">{item.keys}</span>}
          {item.checked && <Icon name="check" size="inline" />}
        </button>
      );
    });

  return (
    <div className="menu" role="menu" aria-label={name} ref={menu} style={place} onKeyDown={onKeyDown}>
      {render(items, true)}
    </div>
  );
}
