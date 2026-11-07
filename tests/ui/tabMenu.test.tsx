// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { submenuPlace, TabMenu, type TabMenuItem } from "@/ui/TabMenu";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@tauri-apps/plugin-opener", () => ({ revealItemInDir: vi.fn() }));

let host: HTMLElement;
let root: Root;
let ran: string[];
let closed: number;

const run = (name: string) => () => void ran.push(name);
const items = (): TabMenuItem[] => [
  { label: "Copy path", run: run("copy") },
  {
    label: "Add to",
    submenu: [
      { label: "Pinned", checked: false, checkbox: true, run: run("pinned") },
      "separator",
      { label: "Reading", checked: true, checkbox: true, disabled: true, run: run("reading") },
      { label: "Travel", checked: false, checkbox: true, run: run("travel") },
      "separator",
      { label: "New workspace…", run: run("new") },
    ],
  },
  "separator",
  { label: "Remove", run: run("remove") },
];

beforeEach(() => {
  ran = [];
  closed = 0;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(<TabMenu name="draft.md" x={10} y={10} items={items()} onClose={() => void closed++} />));
});

afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
});

const menus = () => [...document.querySelectorAll<HTMLElement>('[role="menu"]')];
const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>(".menu button")].find((b) => b.textContent === label)!;
const trigger = () => button("Add to");
const key = (k: string) => act(() => void document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true })));
const labelsOf = (menu: Element) => [...menu.querySelectorAll(":scope > button, :scope > .menu-sub > button, :scope > [role=separator]")].map((b) => (b.getAttribute("role") === "separator" ? "-" : b.textContent));

test("an item with a submenu says so to screen readers, and the menu reads as before", () => {
  expect(menus()).toHaveLength(1);
  expect(labelsOf(menus()[0])).toEqual(["Copy path", "Add to", "-", "Remove"]);
  expect(trigger().getAttribute("role")).toBe("menuitem");
  expect(trigger().getAttribute("aria-haspopup")).toBe("menu");
  expect(trigger().getAttribute("aria-expanded")).toBe("false");
  expect(document.activeElement).toBe(button("Copy path"));
});

test("Right opens the submenu with the focus on its first item, and Left closes only the submenu", () => {
  key("ArrowDown");
  expect(document.activeElement).toBe(trigger());
  key("ArrowRight");
  expect(trigger().getAttribute("aria-expanded")).toBe("true");
  const sub = menus()[1];
  expect(sub.getAttribute("aria-label")).toBe("Add to");
  expect(labelsOf(sub)).toEqual(["Pinned", "-", "Reading", "Travel", "-", "New workspace…"]);
  expect(document.activeElement).toBe(button("Pinned"));
  // Never hidden: a browser won't move the focus into a hidden menu.
  expect(sub.style.visibility).toBe("");
  key("ArrowLeft");
  expect(menus()).toHaveLength(1);
  expect(document.activeElement).toBe(trigger());
  expect(closed).toBe(0);
});

test("Enter opens the submenu, Escape in it closes only the submenu, and Escape again closes the menu", () => {
  key("ArrowDown");
  key("Enter");
  expect(menus()).toHaveLength(2);
  key("Escape");
  expect(menus()).toHaveLength(1);
  expect(document.activeElement).toBe(trigger());
  expect(closed).toBe(0);
  key("Escape");
  expect(closed).toBe(1);
});

test("Up and Down move within the submenu, past a disabled item, and wrap", () => {
  key("ArrowDown");
  key("ArrowRight");
  key("ArrowDown");
  expect(document.activeElement).toBe(button("Travel"));
  key("ArrowDown");
  expect(document.activeElement).toBe(button("New workspace…"));
  key("ArrowDown");
  expect(document.activeElement).toBe(button("Pinned"));
  key("ArrowUp");
  expect(document.activeElement).toBe(button("New workspace…"));
  // Moving in the menu itself closes the submenu.
  key("ArrowLeft");
  key("ArrowDown");
  expect(document.activeElement).toBe(button("Remove"));
});

test("checked items are ticked checkboxes, and one that is also disabled can't be picked", () => {
  key("ArrowDown");
  key("ArrowRight");
  const reading = button("Reading");
  expect(reading.getAttribute("role")).toBe("menuitemcheckbox");
  expect(reading.getAttribute("aria-checked")).toBe("true");
  expect(reading.disabled).toBe(true);
  expect(reading.querySelector("svg")).not.toBeNull();
  expect(button("Travel").getAttribute("aria-checked")).toBe("false");
  act(() => reading.click());
  expect(ran).toEqual([]);
});

test("picking an item in the submenu runs it and closes the menu", () => {
  key("ArrowDown");
  key("Enter");
  key("ArrowDown");
  act(() => document.activeElement!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  expect(ran).toEqual(["travel"]);
  expect(closed).toBe(1);
});

test("hovering the item opens its submenu without taking the focus, and hovering another item closes it", () => {
  act(() => void trigger().dispatchEvent(new MouseEvent("mouseover", { bubbles: true })));
  expect(menus()).toHaveLength(2);
  expect(document.activeElement).toBe(button("Copy path"));
  act(() => void button("Remove").dispatchEvent(new MouseEvent("mouseover", { bubbles: true })));
  expect(menus()).toHaveLength(1);
});

test("a click on the item opens the submenu and keeps the menu open", () => {
  act(() => trigger().click());
  expect(menus()).toHaveLength(2);
  expect(closed).toBe(0);
  expect(ran).toEqual([]);
});

test("a submenu opens to the right of its item, or to the left when the window ends, and stays inside it", () => {
  const item = { left: 100, right: 340, top: 50, bottom: 80 } as DOMRect;
  const box = { width: 230, height: 200 };
  expect(submenuPlace(item, box, 1280, 800)).toEqual({ left: 344, top: 45 });
  expect(submenuPlace(item, box, 500, 800)).toEqual({ left: 4, top: 45 });
  expect(submenuPlace({ ...item, left: 600, right: 840 } as DOMRect, box, 1000, 800)).toEqual({ left: 366, top: 45 });
  expect(submenuPlace({ ...item, top: 700 } as DOMRect, box, 1280, 800)).toEqual({ left: 344, top: 596 });
});
