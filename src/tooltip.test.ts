// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { installTooltips, placeTip, splitKeys } from "./tooltip";

const VIEW = { width: 800, height: 600 };
const SIZE = { width: 100, height: 24 };
const box = (left: number, top: number, width = 40, height = 20) => ({ left, top, right: left + width, bottom: top + height });

test("a tip sits centred below its element", () => {
  expect(placeTip(box(300, 100), SIZE, VIEW)).toEqual({ left: 270, top: 126, side: "below" });
});

test("a tip flips above its element near the bottom edge", () => {
  expect(placeTip(box(300, 570), SIZE, VIEW)).toEqual({ left: 270, top: 540, side: "above" });
});

test("a tip stays inside the window near the left and right edges", () => {
  expect(placeTip(box(0, 100), SIZE, VIEW).left).toBe(8);
  expect(placeTip(box(770, 100, 30), SIZE, VIEW).left).toBe(692);
});

test("a tip taller than the room on both sides stays below, inside the window", () => {
  expect(placeTip(box(300, 280), { width: 100, height: 400 }, VIEW)).toEqual({ left: 270, top: 192, side: "below" });
});

test("the keys at the end of a tip are split off", () => {
  expect(splitKeys("Save (Ctrl+S)")).toEqual({ label: "Save", keys: "Ctrl+S" });
  expect(splitKeys("Bold (Ctrl+Shift+B)")).toEqual({ label: "Bold", keys: "Ctrl+Shift+B" });
  expect(splitKeys("Close (Escape)")).toEqual({ label: "Close", keys: "Escape" });
  expect(splitKeys("Full screen (F11)")).toEqual({ label: "Full screen", keys: "F11" });
  expect(splitKeys("Removed (2)")).toEqual({ label: "Removed (2)" });
  expect(splitKeys("C:\\notes (old)\\a.md")).toEqual({ label: "C:\\notes (old)\\a.md" });
});

let stop: () => void;
let button: HTMLButtonElement;
const tip = () => document.querySelector<HTMLElement>(".app-tip")!;

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '<button data-tip="Save (Ctrl+S)"><svg></svg></button><p>text</p>';
  button = document.querySelector("button")!;
  stop = installTooltips(document, 500);
});

afterEach(() => {
  stop();
  vi.useRealTimers();
});

const hover = (el: Element, from: Element | null = null) => {
  from?.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, relatedTarget: el }));
  el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, relatedTarget: from }));
};

test("hovering shows the tip after the delay, with its keys apart", () => {
  hover(button.querySelector("svg")!);
  vi.advanceTimersByTime(499);
  expect(tip().hidden).toBe(true);
  vi.advanceTimersByTime(1);
  expect(tip().hidden).toBe(false);
  expect(tip().textContent).toBe("SaveCtrl+S");
  expect(tip().querySelector("kbd")!.textContent).toBe("Ctrl+S");
  expect(tip().getAttribute("aria-hidden")).toBe("true");
});

test("moving inside the element keeps the tip; leaving it hides the tip", () => {
  hover(button);
  vi.advanceTimersByTime(500);
  hover(button.querySelector("svg")!, button);
  expect(tip().hidden).toBe(false);
  hover(document.querySelector("p")!, button.querySelector("svg")!);
  expect(tip().hidden).toBe(true);
});

test("leaving before the delay shows nothing", () => {
  hover(button);
  hover(document.querySelector("p")!, button);
  vi.advanceTimersByTime(1000);
  expect(tip().hidden).toBe(true);
});

test("focus from a click shows nothing", () => {
  button.focus();
  expect(tip().hidden).toBe(true);
});

test("keyboard focus shows the tip at once; Escape and leaving hide it", () => {
  const matches = button.matches.bind(button);
  vi.spyOn(button, "matches").mockImplementation((selector) => selector === ":focus-visible" || matches(selector));
  button.focus();
  expect(tip().hidden).toBe(false);
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  expect(tip().hidden).toBe(true);
  button.blur();
  button.focus();
  expect(tip().hidden).toBe(false);
  button.blur();
  expect(tip().hidden).toBe(true);
});

test("a click hides the tip", () => {
  hover(button);
  vi.advanceTimersByTime(500);
  button.dispatchEvent(new Event("pointerdown", { bubbles: true }));
  expect(tip().hidden).toBe(true);
});

test("an element without data-tip shows nothing, and removing the tooltips removes the element", () => {
  hover(document.querySelector("p")!);
  vi.advanceTimersByTime(1000);
  expect(tip().hidden).toBe(true);
  stop();
  expect(document.querySelector(".app-tip")).toBeNull();
  stop = () => {};
});
