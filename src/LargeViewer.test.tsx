// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { LargeViewer } from "./LargeViewer";
import type { LargeContent } from "./largeView";

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

function show(content: LargeContent, onClose = vi.fn()) {
  act(() => root.render(<LargeViewer content={content} onClose={onClose} />));
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
  show({ kind: "table", title: "Data", markup: "<table><tr><td>cell</td></tr></table>" });
  const dialog = document.querySelector('[role="dialog"]')!;
  expect(dialog.querySelector(".doc.large-table td")!.textContent).toBe("cell");
  expect(dialog.querySelector('input[type="range"]')).toBeNull();
});

test("an image shows its source", () => {
  show({ kind: "image", title: "Map", src: "asset:/d/map.png", alt: "Map" });
  expect(document.querySelector("img")!.getAttribute("src")).toBe("asset:/d/map.png");
});

test("Escape closes the view and goes no further", () => {
  const onClose = show({ kind: "table", title: "Data", markup: "<table></table>" });
  const later = vi.fn();
  window.addEventListener("keydown", later);
  press("Escape");
  window.removeEventListener("keydown", later);
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(later).not.toHaveBeenCalled();
});

test("the close button and a click on the backdrop close it; a click in the panel does not", () => {
  const onClose = show({ kind: "table", title: "Data", markup: "<table></table>" });
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
  show({ kind: "table", title: "Data", markup: "<table></table>" });
  expect(document.activeElement).not.toBe(opener);
  act(() => root.render(<div />));
  expect(document.activeElement).toBe(opener);
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
