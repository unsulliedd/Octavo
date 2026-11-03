// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Home } from "./Home";
import type { Workspace } from "./workspaces";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const reveal = vi.hoisted(() => vi.fn(async (_path: string) => {}));
vi.mock("@tauri-apps/plugin-opener", () => ({ revealItemInDir: reveal }));

const FOLDER: Workspace = { id: "w1", name: "Notes", items: [{ kind: "folder", path: "C:/notes" }], removed: [] };
const PICKED: Workspace = { id: "w2", name: "Picked", items: [{ kind: "document", path: "C:/a/one.md" }], removed: [] };

let host: HTMLElement;
let root: Root;
let on: any;
let writeText: ReturnType<typeof vi.fn>;

beforeEach(() => {
  on = { onOpen: vi.fn(), onOpenWorkspace: vi.fn(), onRemoveWorkspace: vi.fn(), onTogglePin: vi.fn(), onError: vi.fn(), onPick: vi.fn(), onPickFolder: vi.fn() };
  writeText = vi.fn(async () => {});
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  reveal.mockClear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root.render(
      <Home
        recent={[{ path: "C:/docs/recent.md", at: 1 }, { path: "C:/docs/pin.md", at: 2 }]}
        pinned={["C:/docs/pin.md"]}
        dragging={false}
        workspaces={[FOLDER, PICKED]}
        {...on}
      />,
    ),
  );
});

afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

const rows = () => [...host.querySelectorAll<HTMLElement>(".file-row")];
const row = (text: string) => rows().find((r) => r.textContent?.includes(text))!;
const rightClick = (el: Element) => {
  const e = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 30, clientY: 40 });
  act(() => void el.dispatchEvent(e));
  return e;
};
const menu = () => document.querySelector<HTMLElement>('[role="menu"]');
const labels = () => [...menu()!.querySelectorAll("button")].map((b) => b.textContent);
const pick = (label: string) => act(() => void [...menu()!.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === label)!.click());

test("right-clicking a recent document opens its menu, and the default menu stays hidden", () => {
  const e = rightClick(row("recent.md"));
  expect(e.defaultPrevented).toBe(true);
  expect(menu()!.getAttribute("aria-label")).toBe("recent.md");
  expect(labels()).toEqual(["Open", "Open containing folder", "Copy path", "Pin"]);
});

test("a pinned document's menu says Unpin; Open, Open containing folder, Copy path and the pin act on its path", () => {
  rightClick(row("pin.md"));
  expect(labels()).toContain("Unpin");
  pick("Unpin");
  expect(on.onTogglePin).toHaveBeenCalledWith("C:/docs/pin.md");
  rightClick(row("pin.md"));
  pick("Open");
  expect(on.onOpen).toHaveBeenCalledWith("C:/docs/pin.md");
  rightClick(row("pin.md"));
  pick("Open containing folder");
  expect(reveal).toHaveBeenCalledWith("C:/docs/pin.md");
  rightClick(row("pin.md"));
  pick("Copy path");
  expect(writeText).toHaveBeenCalledWith("C:/docs/pin.md");
  expect(menu()).toBeNull();
});

test("a failed reveal is reported", async () => {
  reveal.mockRejectedValueOnce("no such folder");
  rightClick(row("recent.md"));
  await act(async () => void pick("Open containing folder"));
  expect(on.onError).toHaveBeenCalledWith("no such folder");
});

test("a workspace of a folder offers Open, Open folder in Explorer and Remove workspace", () => {
  rightClick(row("Notes"));
  expect(menu()!.getAttribute("aria-label")).toBe("Notes");
  expect(labels()).toEqual(["Open", "Open folder in Explorer", "Remove workspace"]);
  pick("Open folder in Explorer");
  expect(reveal).toHaveBeenCalledWith("C:/notes");
  rightClick(row("Notes"));
  pick("Remove workspace");
  expect(on.onRemoveWorkspace).toHaveBeenCalledWith("w1");
  rightClick(row("Notes"));
  pick("Open");
  expect(on.onOpenWorkspace).toHaveBeenCalledWith("w1");
});

test("a workspace whose first item is a document has no Open folder in Explorer", () => {
  rightClick(row("Picked"));
  expect(labels()).toEqual(["Open", "Remove workspace"]);
});

test("the context-menu key and Shift+F10 on a focused row open its menu, with focus on the first item", () => {
  const open = row("recent.md").querySelector<HTMLElement>(".file-open")!;
  open.focus();
  act(() => void open.dispatchEvent(new KeyboardEvent("keydown", { key: "ContextMenu", bubbles: true, cancelable: true })));
  expect(labels()).toEqual(["Open", "Open containing folder", "Copy path", "Pin"]);
  expect(document.activeElement).toBe(menu()!.querySelector("button"));
  act(() => void document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  expect(menu()).toBeNull();
  expect(document.activeElement).toBe(open);
  act(() => void open.dispatchEvent(new KeyboardEvent("keydown", { key: "F10", shiftKey: true, bubbles: true, cancelable: true })));
  expect(menu()).not.toBeNull();
});

test("a click elsewhere closes the menu, and a plain F10 does nothing", () => {
  rightClick(row("recent.md"));
  act(() => void document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));
  expect(menu()).toBeNull();
  const open = row("recent.md").querySelector<HTMLElement>(".file-open")!;
  act(() => void open.dispatchEvent(new KeyboardEvent("keydown", { key: "F10", bubbles: true, cancelable: true })));
  expect(menu()).toBeNull();
});
