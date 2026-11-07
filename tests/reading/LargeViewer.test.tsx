// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { LargeViewer } from "@/reading/LargeViewer";
import type { LargeContent } from "@/reading/largeView";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SVG = '<svg id="m-1-large" viewBox="0 0 200 100"><rect width="200" height="100"/></svg>';
let host: HTMLElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

function show(content: LargeContent, onClose = vi.fn(), onOpenLink = vi.fn(), onResizeTable = vi.fn()) {
  act(() => root.render(<LargeViewer content={content} onClose={onClose} onOpenLink={onOpenLink} onResizeTable={onResizeTable} />));
  return onClose;
}

const press = (key: string, init: KeyboardEventInit = {}) =>
  act(() => {
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }));
  });

test("a diagram opens as a dialog titled by its heading, with the zoom controls and focus on Close", () => {
  show({ kind: "diagram", title: "Flow", markup: SVG });
  const dialog = document.querySelector('[role="dialog"]')!;
  expect(dialog.getAttribute("aria-modal")).toBe("true");
  expect(dialog.getAttribute("aria-label")).toBe("Flow");
  expect(dialog.querySelector("header strong")!.textContent).toBe("Flow");
  expect(dialog.querySelector("svg")).not.toBeNull();
  const zoom = dialog.querySelector<HTMLInputElement>('input[type="range"]')!;
  expect([zoom.min, zoom.max, zoom.step]).toEqual(["10", "400", "5"]);
  expect(dialog.querySelector("output")!.textContent).toMatch(/^[0-9]+%$/);
  expect(dialog.textContent).toContain("Drag to move · Ctrl+wheel zooms · double-click fits");
  expect(document.activeElement).toBe(dialog.querySelector('button[aria-label="Close (Escape)"]'));
});

test("a table opens as a copy at the panel's width, without the zoom controls", () => {
  show({ kind: "table", title: "Data", markup: "<table><tr><td>cell</td></tr></table>", index: 0 });
  const dialog = document.querySelector('[role="dialog"]')!;
  expect(dialog.querySelector(".doc.large-table td")!.textContent).toBe("cell");
  expect(dialog.querySelector('input[type="range"]')).toBeNull();
});

test("an image shows its source", () => {
  show({ kind: "image", title: "Map", src: "asset:/d/map.png", alt: "Map" });
  expect(document.querySelector("img")!.getAttribute("src")).toBe("asset:/d/map.png");
});

test("Escape closes the view and goes no further", () => {
  const onClose = show({ kind: "table", title: "Data", markup: "<table></table>", index: 0 });
  const later = vi.fn();
  window.addEventListener("keydown", later);
  press("Escape");
  window.removeEventListener("keydown", later);
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(later).not.toHaveBeenCalled();
});

test("the close button and a click on the backdrop close it; a click in the panel does not", () => {
  const onClose = show({ kind: "table", title: "Data", markup: "<table></table>", index: 0 });
  const backdrop = document.querySelector<HTMLElement>(".large-backdrop")!;
  const click = (el: Element) =>
    act(() => {
      el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
  click(document.querySelector(".large-panel")!);
  expect(onClose).not.toHaveBeenCalled();
  click(backdrop);
  expect(onClose).toHaveBeenCalledTimes(1);
  act(() => document.querySelector<HTMLElement>('button[aria-label="Close (Escape)"]')!.click());
  expect(onClose).toHaveBeenCalledTimes(2);
});

test("focus goes back to where it was when the view closes", () => {
  const opener = document.createElement("button");
  document.body.append(opener);
  opener.focus();
  show({ kind: "table", title: "Data", markup: "<table></table>", index: 0 });
  expect(document.activeElement).not.toBe(opener);
  act(() => root.render(<div />));
  expect(document.activeElement).toBe(opener);
});

/** Clicks `el` and returns whether the page's own navigation was stopped. */
function clickLink(el: Element) {
  const event = new MouseEvent("click", { bubbles: true, cancelable: true });
  act(() => void el.dispatchEvent(event));
  return event.defaultPrevented;
}

test("a link in a table goes to onOpenLink instead of navigating the window", () => {
  const onOpenLink = vi.fn();
  show({ kind: "table", title: "Data", markup: '<table><tr><td><a href="https://example.com/"><b>site</b></a></td></tr></table>', index: 0 }, vi.fn(), onOpenLink);
  expect(clickLink(document.querySelector("b")!)).toBe(true);
  expect(onOpenLink).toHaveBeenCalledWith("https://example.com/");
});

test("a link in a diagram goes to onOpenLink, by its xlink:href", () => {
  const onOpenLink = vi.fn();
  const svg = '<svg viewBox="0 0 10 10" xmlns:xlink="http://www.w3.org/1999/xlink"><a xlink:href="other.md"><text>node</text></a></svg>';
  show({ kind: "diagram", title: "Flow", markup: svg }, vi.fn(), onOpenLink);
  expect(clickLink(document.querySelector("text")!)).toBe(true);
  expect(onOpenLink).toHaveBeenCalledWith("other.md");
});

test("a click outside a link opens nothing, and a link with no target goes nowhere", () => {
  const onOpenLink = vi.fn();
  show({ kind: "table", title: "Data", markup: '<table><tr><td>cell</td><td><a href="">empty</a></td></tr></table>', index: 0 }, vi.fn(), onOpenLink);
  expect(clickLink(document.querySelector("td")!)).toBe(false);
  expect(clickLink(document.querySelector("a")!)).toBe(true);
  expect(onOpenLink).not.toHaveBeenCalled();
});

test("a press on a link in a zoomed diagram leaves the click to the link; elsewhere it starts a drag", () => {
  const capture = vi.fn();
  Element.prototype.setPointerCapture = capture;
  vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(1000);
  show({ kind: "diagram", title: "Flow", markup: '<svg viewBox="0 0 10 10"><a href="other.md"><text>node</text></a><rect/></svg>' });
  const press = (el: Element) => act(() => void el.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0 })));
  press(document.querySelector("text")!);
  expect(capture).not.toHaveBeenCalled();
  press(document.querySelector("rect")!);
  expect(capture).toHaveBeenCalledTimes(1);
  vi.restoreAllMocks();
});

test("Tab reaches the links in the panel", () => {
  show({ kind: "table", title: "Data", markup: '<table><tr><td><a href="other.md">other</a></td></tr></table>', index: 0 });
  press("Tab");
  expect(document.activeElement).toBe(document.querySelector("a"));
});

test("Tab reaches a diagram's links, which have an xlink:href", () => {
  show({ kind: "diagram", title: "Flow", markup: '<svg viewBox="0 0 10 10" xmlns:xlink="http://www.w3.org/1999/xlink"><a xlink:href="other.md"><text>node</text></a></svg>' });
  const link = document.querySelector("svg a") as unknown as HTMLElement;
  const items = document.querySelectorAll(".large-panel button, .large-panel input, .large-panel a");
  expect(items).toHaveLength(4);
  link.focus = vi.fn();
  press("Tab");
  press("Tab");
  expect(link.focus).toHaveBeenCalled();
});

test("Tab stays inside the panel", () => {
  show({ kind: "diagram", title: "Flow", markup: SVG });
  const close = document.querySelector<HTMLElement>('button[aria-label="Close (Escape)"]')!;
  const fit = [...document.querySelectorAll<HTMLElement>("button")].find((b) => b.textContent === "Fit")!;
  press("Tab");
  expect(document.activeElement).not.toBe(close);
  press("Tab");
  press("Tab");
  expect(document.activeElement).toBe(close);
  press("Tab", { shiftKey: true });
  expect(document.activeElement).toBe(fit);
});

const TABLE = '<table class="sized" style="width: 20em"><thead><tr><th style="width: 10em">A</th><th style="width: 10em">B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>';

test("a table opens at the widths it has in the document, with a handle on every header cell", () => {
  show({ kind: "table", title: "Data", markup: TABLE, index: 3 });
  const table = document.querySelector<HTMLTableElement>(".large-table table")!;
  expect(table.classList.contains("sized")).toBe(true);
  expect([...table.rows[0].cells].map((c) => c.style.width)).toEqual(["10em", "10em"]);
  expect(table.querySelectorAll(".col-resize")).toHaveLength(2);
});

test("dragging a column edge in the large table reports the new widths for that table", () => {
  const onResizeTable = vi.fn();
  show({ kind: "table", title: "Data", markup: TABLE, index: 3 }, vi.fn(), vi.fn(), onResizeTable);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 160 } as DOMRect);
  HTMLElement.prototype.setPointerCapture = vi.fn();
  const handle = document.querySelector<HTMLElement>(".large-table .col-resize")!;
  const fire = (type: string, clientX: number) => act(() => void handle.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX })));
  fire("pointerdown", 100);
  fire("pointermove", 140);
  fire("pointerup", 140);
  expect(onResizeTable).toHaveBeenCalledWith(3, ["A", "B"], [12.5, 10]);
  vi.restoreAllMocks();
});

test("double-clicking a column edge in the large table resets its widths", () => {
  const onResizeTable = vi.fn();
  show({ kind: "table", title: "Data", markup: TABLE, index: 3 }, vi.fn(), vi.fn(), onResizeTable);
  const handle = document.querySelector<HTMLElement>(".large-table .col-resize")!;
  act(() => void handle.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true })));
  expect(onResizeTable).toHaveBeenCalledWith(3, ["A", "B"], [null, null]);
  expect(document.querySelector(".large-table table")!.classList.contains("sized")).toBe(false);
});
