// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Home } from "@/home/Home";
import type { Workspace } from "@/workspaces/workspaces";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const reveal = vi.hoisted(() => vi.fn(async (_path: string) => {}));
vi.mock("@tauri-apps/plugin-opener", () => ({ revealItemInDir: reveal }));

const FOLDER: Workspace = { id: "w1", name: "Notes", items: [{ kind: "folder", path: "C:/notes" }], removed: [] };
const PICKED: Workspace = { id: "w2", name: "Picked", items: [{ kind: "document", path: "C:/a/one.md" }], removed: [] };
const OWN: Workspace = { id: "w3", name: "Mine", items: [{ kind: "folder", path: "C:/mine" }], removed: [], own: true };

let host: HTMLElement;
let root: Root;
let on: any;
let writeText: ReturnType<typeof vi.fn>;
let added: string[];

beforeEach(() => {
  on = {
    onOpen: vi.fn(),
    onOpenWorkspace: vi.fn(),
    onNewWorkspace: vi.fn(),
    onRemoveWorkspace: vi.fn(),
    onRenameWorkspace: vi.fn(),
    coverUrl: (w: Workspace) => (w.cover ? `asset://covers/${w.cover}?v=1` : undefined),
    onChooseCover: vi.fn(async () => {}),
    onRemoveCover: vi.fn(async () => {}),
    onTogglePin: vi.fn(),
    onError: vi.fn(),
    onPick: vi.fn(),
    onPickFolder: vi.fn(),
    addTo: vi.fn((item: { path: string }) => ({ label: "Add to", submenu: [{ label: "Pinned", run: () => added.push(item.path) }] })),
  };
  added = [];
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
        workspaces={[FOLDER, PICKED, OWN]}
        openWorkspace={PICKED}
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
const cards = () => [...host.querySelectorAll<HTMLElement>(".card")];
const card = (name: string) => cards().find((c) => c.querySelector(".card-name")?.textContent === name)!;
const key = (el: Element, init: KeyboardEventInit) => act(() => void el.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init })));
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
  expect(labels()).toEqual(["Open", "Open containing folder", "Copy path", "Add to", "Pin"]);
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

test("a workspace of a folder offers Open, Open folder in Explorer, Rename… and Remove workspace", () => {
  rightClick(card("Notes"));
  expect(menu()!.getAttribute("aria-label")).toBe("Notes");
  expect(labels()).toEqual(["Open", "Rename…", "Choose image…", "Open folder in Explorer", "Remove workspace"]);
  pick("Rename…");
  expect(on.onRenameWorkspace).toHaveBeenCalledWith("w1");
  rightClick(card("Notes"));
  pick("Open folder in Explorer");
  expect(reveal).toHaveBeenCalledWith("C:/notes");
  rightClick(card("Notes"));
  pick("Remove workspace");
  expect(on.onRemoveWorkspace).toHaveBeenCalledWith("w1");
  rightClick(card("Notes"));
  pick("Open");
  expect(on.onOpenWorkspace).toHaveBeenCalledWith("w1");
});

test("a workspace whose first item is a document, and an own workspace, have no Open folder in Explorer", () => {
  rightClick(card("Picked"));
  expect(labels()).toEqual(["Open", "Rename…", "Choose image…", "Remove workspace"]);
  rightClick(card("Mine"));
  expect(labels()).toEqual(["Open", "Rename…", "Choose image…", "Remove workspace"]);
  pick("Rename…");
  expect(on.onRenameWorkspace).toHaveBeenCalledWith("w3");
});

test("a document's menu has Add to for its path, before Pin", () => {
  rightClick(row("recent.md"));
  expect(on.addTo).toHaveBeenLastCalledWith({ kind: "document", path: "C:/docs/recent.md" });
  const item = [...menu()!.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === "Add to")!;
  expect(item.getAttribute("aria-haspopup")).toBe("menu");
  act(() => item.click());
  pick("Pinned");
  expect(added).toEqual(["C:/docs/recent.md"]);
  expect(menu()).toBeNull();
});

test("the context-menu key and Shift+F10 on a focused row open its menu, with focus on the first item", () => {
  const open = row("recent.md").querySelector<HTMLElement>(".file-open")!;
  open.focus();
  act(() => void open.dispatchEvent(new KeyboardEvent("keydown", { key: "ContextMenu", bubbles: true, cancelable: true })));
  expect(labels()).toEqual(["Open", "Open containing folder", "Copy path", "Add to", "Pin"]);
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

test("the + card comes first, then Pinned, then the workspaces in their saved order", () => {
  const items = [...host.querySelectorAll(".card-grid > li")];
  expect(items[0].querySelector(".card-new")?.textContent).toBe("New workspace");
  expect(cards().map((c) => c.querySelector(".card-name")?.textContent)).toEqual(["Pinned", "Notes", "Picked", "Mine"]);
  expect(cards().map((c) => c.querySelector(".card-meta-text")?.textContent)).toEqual(["Empty", "C: › notes", "1 document", "C: › mine"]);
  expect(cards().map((c) => c.querySelector(".card-meta")?.getAttribute("data-kind"))).toEqual(["pinned", "folder", "folder", "own"]);
  expect(cards().every((c) => c.querySelector(".cover svg.cover-art rect"))).toBe(true);
});

test("the + card runs New workspace", () => {
  act(() => host.querySelector<HTMLButtonElement>(".card-new")!.click());
  expect(on.onNewWorkspace).toHaveBeenCalledTimes(1);
});

test("a click on a card opens its workspace, and the open one is marked", () => {
  act(() => card("Notes").querySelector<HTMLButtonElement>(".card-open")!.click());
  expect(on.onOpenWorkspace).toHaveBeenCalledWith("w1");
  act(() => card("Pinned").querySelector<HTMLButtonElement>(".card-open")!.click());
  expect(on.onOpenWorkspace).toHaveBeenLastCalledWith("pinned");
  expect(host.querySelectorAll(".card-chip")).toHaveLength(1);
  expect(card("Picked").querySelector(".card-chip")?.textContent).toBe("Open");
  expect(card("Picked").querySelector(".card-open")?.getAttribute("aria-label")).toBe("Picked, 1 document, open");
  expect(card("Notes").querySelector(".card-open")?.getAttribute("aria-label")).toBe("Notes, C: › notes");
});

test("Pinned's menu has only Open", () => {
  rightClick(card("Pinned"));
  expect(menu()!.getAttribute("aria-label")).toBe("Pinned");
  expect(labels()).toEqual(["Open"]);
  pick("Open");
  expect(on.onOpenWorkspace).toHaveBeenCalledWith("pinned");
});

test("the ⋯ button opens the card's menu and says so; Escape gives it the focus back", () => {
  const more = card("Mine").querySelector<HTMLButtonElement>(".card-more")!;
  expect(more.getAttribute("aria-label")).toBe("More for Mine");
  expect(more.getAttribute("aria-haspopup")).toBe("menu");
  expect(more.getAttribute("aria-expanded")).toBe("false");
  more.focus();
  act(() => more.click());
  expect(labels()).toEqual(["Open", "Rename…", "Choose image…", "Remove workspace"]);
  expect(more.getAttribute("aria-expanded")).toBe("true");
  expect(card("Mine").hasAttribute("data-menu")).toBe(true);
  key(document.activeElement!, { key: "Escape" });
  expect(menu()).toBeNull();
  expect(document.activeElement).toBe(more);
  act(() => more.click());
  pick("Remove workspace");
  expect(on.onRemoveWorkspace).toHaveBeenCalledWith("w3");
});

test("every card is reached with Tab, and the context-menu key or Shift+F10 on it opens its menu", () => {
  const stops = [...host.querySelectorAll<HTMLElement>(".card-grid button")];
  expect(stops.every((b) => b.tabIndex === 0)).toBe(true);
  expect(stops.map((b) => b.getAttribute("aria-label") ?? b.textContent)).toEqual([
    "New workspace",
    "Pinned, Empty",
    "More for Pinned",
    "Notes, C: › notes",
    "More for Notes",
    "Picked, 1 document, open",
    "More for Picked",
    "Mine, C: › mine",
    "More for Mine",
  ]);
  const open = card("Notes").querySelector<HTMLElement>(".card-open")!;
  open.focus();
  key(open, { key: "ContextMenu" });
  expect(menu()!.getAttribute("aria-label")).toBe("Notes");
  expect(document.activeElement).toBe(menu()!.querySelector("button"));
  key(document.activeElement!, { key: "Escape" });
  expect(document.activeElement).toBe(open);
  key(open, { key: "F10", shiftKey: true });
  expect(labels()).toEqual(["Open", "Rename…", "Choose image…", "Open folder in Explorer", "Remove workspace"]);
});

test("pinned documents list with the recent ones, their pin pressed, and Pinned has no rows of its own", () => {
  expect(rows().map((r) => r.querySelector(".file-name")?.textContent)).toEqual(["recent.md", "pin.md"]);
  expect(row("pin.md").querySelector(".pin")?.getAttribute("aria-pressed")).toBe("true");
  expect(row("recent.md").querySelector(".pin")?.getAttribute("aria-pressed")).toBe("false");
  act(() => row("recent.md").querySelector<HTMLButtonElement>(".pin")!.click());
  expect(on.onTogglePin).toHaveBeenCalledWith("C:/docs/recent.md");
  expect(host.querySelector(".drop-zone")).toBeNull();
});

test("the first launch shows the drop box and the + card alone", () => {
  act(() => root.render(<Home recent={[]} pinned={[]} dragging={false} workspaces={[]} {...on} />));
  expect(host.querySelector(".drop-zone")?.textContent).toBe("Or drop a file anywhere in this window");
  expect(cards()).toHaveLength(0);
  expect(host.querySelector(".card-new")).not.toBeNull();
  expect(rows()).toHaveLength(0);
  act(() => root.render(<Home recent={[]} pinned={[]} dragging workspaces={[]} {...on} />));
  expect(host.querySelector(".drop-zone")?.textContent).toBe("Drop to open");
});

test("past the first launch, dragging a file shows the drop overlay", () => {
  expect(document.querySelector(".drop-overlay")).toBeNull();
  act(() => root.render(<Home recent={[]} pinned={[]} dragging workspaces={[FOLDER]} {...on} />));
  expect(document.querySelector(".drop-overlay")?.textContent).toBe("Drop to open");
});

const COVERED: Workspace = { ...OWN, cover: "w3.png" };
const renderCovered = () => act(() => root.render(<Home recent={[]} pinned={[]} dragging={false} workspaces={[COVERED, FOLDER]} {...on} />));

test("Choose image… is on every card but Pinned, and Remove image only on a card with a cover", () => {
  renderCovered();
  rightClick(card("Mine"));
  expect(labels()).toEqual(["Open", "Rename…", "Choose image…", "Remove image", "Remove workspace"]);
  pick("Choose image…");
  expect(on.onChooseCover).toHaveBeenCalledWith("w3");
  rightClick(card("Mine"));
  pick("Remove image");
  expect(on.onRemoveCover).toHaveBeenCalledWith("w3");
  rightClick(card("Notes"));
  expect(labels()).not.toContain("Remove image");
  rightClick(card("Pinned"));
  expect(labels()).toEqual(["Open"]);
});

test("a cover that can't be chosen or removed is reported", async () => {
  renderCovered();
  on.onChooseCover.mockRejectedValueOnce("not an image file");
  rightClick(card("Mine"));
  await act(async () => void pick("Choose image…"));
  expect(on.onError).toHaveBeenLastCalledWith("not an image file");
  on.onRemoveCover.mockRejectedValueOnce("in use");
  rightClick(card("Mine"));
  await act(async () => void pick("Remove image"));
  expect(on.onError).toHaveBeenLastCalledWith("in use");
});

test("a card with a cover shows its image, under the Open chip, and the default cover when the image fails to load", () => {
  act(() => root.render(<Home recent={[]} pinned={[]} dragging={false} workspaces={[COVERED, FOLDER]} openWorkspace={COVERED} {...on} />));
  const img = card("Mine").querySelector<HTMLImageElement>(".cover img.cover-art")!;
  expect(img.getAttribute("src")).toBe("asset://covers/w3.png?v=1");
  expect(card("Mine").querySelector(".cover svg")).toBeNull();
  expect(card("Mine").querySelector(".cover .card-chip")?.textContent).toBe("Open");
  expect(card("Notes").querySelector(".cover img")).toBeNull();
  act(() => void img.dispatchEvent(new Event("error")));
  expect(card("Mine").querySelector(".cover img")).toBeNull();
  expect(card("Mine").querySelector(".cover svg.cover-art rect")).not.toBeNull();
  // A new image, such as a replaced cover, is tried again.
  act(() => root.render(<Home recent={[]} pinned={[]} dragging={false} workspaces={[COVERED]} {...on} coverUrl={() => "asset://covers/w3.png?v=2"} />));
  expect(card("Mine").querySelector(".cover img")?.getAttribute("src")).toBe("asset://covers/w3.png?v=2");
});
