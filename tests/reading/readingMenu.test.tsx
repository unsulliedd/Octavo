// @vitest-environment jsdom
import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { readingMenuItems, selectAllIn, selectionIn } from "@/reading/readingMenu";
import { useReadingMenu } from "@/reading/useReadingMenu";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@tauri-apps/plugin-opener", () => ({ revealItemInDir: vi.fn() }));

const act0 = { copy: vi.fn(), selectAll: vi.fn(), copyText: vi.fn() };
const labels = (items: ReturnType<typeof readingMenuItems>) => items.map((i) => (i === "separator" ? "-" : (i.label as string)));

test("the items with nothing selected: Copy is off", () => {
  const items = readingMenuItems({ hasSelection: false }, act0);
  expect(labels(items)).toEqual(["Copy", "Select all"]);
  expect(items[0]).toMatchObject({ keys: "Ctrl+C", disabled: true });
  expect(items[1]).toMatchObject({ keys: "Ctrl+A" });
  expect((items[1] as { disabled?: boolean }).disabled).toBeFalsy();
});

test("the items with a selection: Copy is on", () => {
  expect(readingMenuItems({ hasSelection: true }, act0)[0]).toMatchObject({ label: "Copy", disabled: false });
});

test("a link adds Copy link address above the others, and an image Copy image address", () => {
  const copyText = vi.fn();
  const link = readingMenuItems({ hasSelection: false, link: "notes/a.md#top" }, { ...act0, copyText });
  expect(labels(link)).toEqual(["Copy link address", "-", "Copy", "Select all"]);
  (link[0] as { run: () => void }).run();
  expect(copyText).toHaveBeenCalledWith("notes/a.md#top");

  const image = readingMenuItems({ hasSelection: false, image: "images/pic.png" }, { ...act0, copyText });
  expect(labels(image)).toEqual(["Copy image address", "-", "Copy", "Select all"]);
  (image[0] as { run: () => void }).run();
  expect(copyText).toHaveBeenLastCalledWith("images/pic.png");

  expect(labels(readingMenuItems({ hasSelection: true, link: "x", image: "y" }, act0))).toEqual(["Copy link address", "Copy image address", "-", "Copy", "Select all"]);
});

let host: HTMLElement;
let root: Root;
let writeText: ReturnType<typeof vi.fn>;
let failed: ReturnType<typeof vi.fn<(e: unknown) => void>>;

function Reading({ enabled = true }: { enabled?: boolean }) {
  const article = useRef<HTMLElement>(null);
  const reading = useReadingMenu(article, enabled, "a.md", failed);
  return (
    <>
      <p id="outside">Outside the document</p>
      <article ref={article} onContextMenu={reading.onContextMenu} tabIndex={-1}>
        <p id="para">First paragraph with a <a id="link" href="b.md#part">link</a>.</p>
        <p><img id="pic" src="asset://localhost/C%3A/docs/pic.png" data-src="pic.png" alt="" /></p>
        <p id="second">Second paragraph</p>
      </article>
      {reading.menu}
    </>
  );
}

const rightClick = (el: Element) => act(async () => void el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 30, clientY: 40 })));
const key = (target: Element, init: KeyboardEventInit) => act(async () => void target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init })));
const menu = () => document.querySelector('[role="menu"]');
const item = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((b) => b.textContent?.startsWith(label))!;
const select = (el: Node) => window.getSelection()!.selectAllChildren(el);

beforeEach(() => {
  writeText = vi.fn(async () => {});
  failed = vi.fn<(e: unknown) => void>();
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(<Reading />));
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  window.getSelection()?.removeAllRanges();
  vi.unstubAllGlobals();
});

test("a right-click in the document opens the menu and keeps the browser's menu away", async () => {
  const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 30, clientY: 40 });
  await act(async () => void document.getElementById("second")!.dispatchEvent(event));
  expect(event.defaultPrevented).toBe(true);
  expect(menu()).not.toBeNull();
  expect(item("Copy").disabled).toBe(true);
});

test("Copy copies the text that is selected", async () => {
  select(document.getElementById("second")!);
  await rightClick(document.getElementById("second")!);
  expect(item("Copy").disabled).toBe(false);
  await act(async () => item("Copy").click());
  expect(writeText).toHaveBeenCalledWith("Second paragraph");
  expect(menu()).toBeNull();
});

test("a selection outside the document doesn't turn Copy on", async () => {
  select(document.getElementById("outside")!);
  await rightClick(document.getElementById("second")!);
  expect(item("Copy").disabled).toBe(true);
});

test("Select all selects the document's text and nothing outside it", async () => {
  select(document.getElementById("outside")!);
  await rightClick(document.getElementById("second")!);
  await act(async () => item("Select all").click());
  const article = document.querySelector("article")!;
  expect(selectionIn(article)?.toString()).toBe(article.textContent);
  expect(window.getSelection()!.toString()).not.toContain("Outside");
  const range = window.getSelection()!.getRangeAt(0);
  expect(article.contains(range.startContainer) && article.contains(range.endContainer)).toBe(true);
});

test("selectAllIn leaves the rest of the page out", () => {
  selectAllIn(document.getElementById("second")!);
  expect(window.getSelection()!.toString()).toBe("Second paragraph");
});

test("a link and an image each offer their address as written", async () => {
  await rightClick(document.getElementById("link")!);
  await act(async () => item("Copy link address").click());
  expect(writeText).toHaveBeenLastCalledWith("b.md#part");

  await rightClick(document.getElementById("pic")!);
  expect(item("Copy link address")).toBeUndefined();
  await act(async () => item("Copy image address").click());
  expect(writeText).toHaveBeenLastCalledWith("pic.png");
});

test("a failed copy is reported", async () => {
  writeText.mockRejectedValueOnce("denied");
  select(document.getElementById("second")!);
  await rightClick(document.getElementById("second")!);
  await act(async () => item("Copy").click());
  expect(failed).toHaveBeenCalledWith("denied");
});

test("the context-menu key and Shift+F10 open the menu, and Escape closes it and returns the focus", async () => {
  const article = document.querySelector("article")!;
  article.focus();
  await key(article, { key: "ContextMenu" });
  expect(menu()).not.toBeNull();
  expect(document.activeElement).toBe(item("Select all"));
  await key(document.activeElement!, { key: "Escape" });
  expect(menu()).toBeNull();
  expect(document.activeElement).toBe(article);

  await key(article, { key: "F10", shiftKey: true });
  expect(menu()).not.toBeNull();
});

test("the key opens the menu with nothing focused, with the selection counted, and not from elsewhere in the app", async () => {
  select(document.getElementById("second")!);
  await key(document.body, { key: "ContextMenu" });
  expect(item("Copy").disabled).toBe(false);
  await act(async () => item("Select all").click());

  await act(async () => root.render(<Reading />));
  const outside = document.getElementById("outside")!;
  outside.tabIndex = 0;
  outside.focus();
  await key(outside, { key: "ContextMenu" });
  expect(menu()).toBeNull();
});

test("a focused link is the key's target", async () => {
  const link = document.getElementById("link")!;
  link.focus();
  await key(link, { key: "ContextMenu" });
  expect(item("Copy link address")).toBeDefined();
});

test("outside the reading view the menu doesn't open", async () => {
  await act(async () => root.render(<Reading enabled={false} />));
  await key(document.body, { key: "ContextMenu" });
  expect(menu()).toBeNull();
});
