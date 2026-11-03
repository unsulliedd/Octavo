// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { CLOSE_DELAY, EdgeRail, OPEN_DELAY } from "./EdgeRail";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLElement;
let root: Root;
let jumped: number[];

const DASHES = [
  { w: 13, active: true, index: 0, text: "Guide" },
  { w: 10, active: false, index: 1, text: "Setup" },
];

async function show(side: "left" | "right" = "right") {
  host = document.createElement("div");
  host.className = "body";
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root.render(
      <>
        <main className="reader">
          <div className="doc-column" />
        </main>
        <EdgeRail side={side} label="Show outline panel" panelLabel="Outline" dashes={DASHES} width={252} onJump={(i) => jumped.push(i)}>
          <nav className="outline">
            <a href="#a" aria-current="location">
              Guide
            </a>
            <a href="#b">Setup</a>
          </nav>
        </EdgeRail>
      </>,
    ),
  );
}

const key = () => host.querySelector<HTMLButtonElement>(".edge-key")!;
const rows = () => [...host.querySelectorAll<HTMLElement>(".dash-row")];
const place = () => host.querySelector<HTMLElement>(".edge-place")!;
const panel = () => host.querySelector<HTMLElement>(".sidebar");
const pass = (ms: number) => act(async () => void vi.advanceTimersByTime(ms));
const over = (el: Element, buttons = 0) => act(async () => void el.dispatchEvent(new MouseEvent("pointerover", { bubbles: true, buttons })));
const out = (el: Element, to: Element | null = document.body) => act(async () => void el.dispatchEvent(new MouseEvent("pointerout", { bubbles: true, relatedTarget: to })));
const press = (el: Element, name: string) => act(async () => void el.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true })));

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  jumped = [];
  window.innerWidth = 1280;
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("the dashes are hidden from screen readers and one labelled button stands for them", async () => {
  await show();
  expect(host.querySelector(".edge-rail")!.getAttribute("aria-hidden")).toBe("true");
  expect(host.querySelector(".edge-rail button")).toBeNull();
  expect(key().tagName).toBe("BUTTON");
  expect(key().tabIndex).toBe(0);
  expect(key().getAttribute("aria-label")).toBe("Show outline panel");
  expect(key().getAttribute("aria-expanded")).toBe("false");
});

test("there is a dash per heading, the current one marked, each with its heading as a tooltip", async () => {
  await show();
  expect(rows().map((r) => [r.title, r.querySelector<HTMLElement>(".dash")!.style.width, r.querySelector<HTMLElement>(".dash")!.dataset.active])).toEqual([
    ["Guide", "13px", "true"],
    ["Setup", "10px", undefined],
  ]);
  expect(panel()).toBeNull();
});

test("a click on a dash goes to its heading and opens nothing", async () => {
  await show();
  await act(async () => rows()[1].click());
  expect(jumped).toEqual([1]);
});

test("the panel floats out after a short rest on the dashes, not at once", async () => {
  await show();
  await over(rows()[0]);
  await pass(OPEN_DELAY - 1);
  expect(panel()).toBeNull();
  await pass(1);
  expect(panel()!.dataset.floating).toBe("right");
  expect(panel()!.getAttribute("aria-label")).toBe("Outline");
});

test("a pointer passing through does not flicker the panel", async () => {
  await show();
  await over(rows()[0]);
  await pass(OPEN_DELAY - 50);
  await out(rows()[0]);
  await pass(1000);
  expect(panel()).toBeNull();
});

test("the panel stays a moment after the pointer leaves, and stays if the pointer returns", async () => {
  await show();
  await over(rows()[0]);
  await pass(OPEN_DELAY);
  await out(rows()[0]);
  await pass(CLOSE_DELAY - 1);
  expect(panel()).not.toBeNull();
  await over(rows()[0]);
  await pass(1000);
  expect(panel()).not.toBeNull();
  await out(rows()[0]);
  await pass(CLOSE_DELAY);
  expect(panel()).toBeNull();
});

test("moving from the dashes into the panel keeps it open, and leaving the panel closes it", async () => {
  await show();
  await over(rows()[0]);
  await pass(OPEN_DELAY);
  await out(rows()[0], panel());
  await over(panel()!);
  await pass(1000);
  expect(panel()).not.toBeNull();
  await out(panel()!);
  await pass(CLOSE_DELAY);
  expect(panel()).toBeNull();
});

test("it stays open while focus is inside, and closes once focus leaves and the pointer is away", async () => {
  await show();
  await over(rows()[0]);
  await pass(OPEN_DELAY);
  const inside = panel()!.querySelector("a")!;
  await act(async () => inside.focus());
  await out(panel()!);
  await pass(2000);
  expect(panel()).not.toBeNull();
  await act(async () => inside.blur());
  await pass(CLOSE_DELAY);
  expect(panel()).toBeNull();
});

test("focus moved into the panel by a click does not keep it open", async () => {
  await show();
  await over(rows()[0]);
  await pass(OPEN_DELAY);
  const inside = panel()!.querySelector("a")!;
  await act(async () => void inside.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true })));
  await act(async () => inside.focus());
  await act(async () => void inside.dispatchEvent(new MouseEvent("pointerup", { bubbles: true })));
  await out(panel()!);
  await pass(CLOSE_DELAY);
  expect(panel()).toBeNull();
});

test("arriving with a button held, as in a text selection, opens nothing", async () => {
  await show();
  await over(rows()[0], 1);
  await pass(1000);
  expect(panel()).toBeNull();
});

test("a press on the button opens the panel at once and moves focus to the current heading", async () => {
  await show();
  await act(async () => key().click());
  expect(panel()).not.toBeNull();
  expect(key().getAttribute("aria-expanded")).toBe("true");
  expect(document.activeElement).toBe(panel()!.querySelector("a[aria-current]"));
});

test("Escape closes the panel and returns focus to the button", async () => {
  await show();
  await act(async () => key().click());
  const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
  await act(async () => void document.activeElement!.dispatchEvent(event));
  expect(panel()).toBeNull();
  expect(document.activeElement).toBe(key());
  expect(event.defaultPrevented).toBe(true);
});

test("Escape with no floating panel is left alone", async () => {
  await show();
  const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
  await act(async () => void key().dispatchEvent(event));
  expect(event.defaultPrevented).toBe(false);
  await press(key(), "Tab");
});

test("a second press on the button closes the panel", async () => {
  await show();
  await act(async () => key().click());
  await act(async () => key().click());
  expect(panel()).toBeNull();
});

const box = (left: number, right: number) => ({ left, right, top: 0, bottom: 0, width: right - left, height: 0, x: left, y: 0, toJSON() {} }) as DOMRect;
function layout(body: [number, number], reader: [number, number], column: [number, number], padding = "40px") {
  host.getBoundingClientRect = () => box(...body);
  const r = host.querySelector<HTMLElement>(".reader")!;
  r.getBoundingClientRect = () => box(...reader);
  const c = host.querySelector<HTMLElement>(".doc-column")!;
  c.getBoundingClientRect = () => box(...column);
  c.style.paddingLeft = padding;
  c.style.paddingRight = padding;
}

test("on the right the dashes sit in the margin past the text, and the panel opens leftward from there", async () => {
  await show("right");
  layout([0, 1200], [0, 1200], [300, 800]);
  await over(rows()[0]);
  // The text ends at 760; the dashes start 16 px past it.
  expect(place().dataset.margin).toBe("true");
  expect(place().dataset.side).toBe("right");
  expect(place().style.left).toBe("776px");
  expect(host.querySelector<HTMLElement>(".edge")!.style.getPropertyValue("--panel-right")).toBe("430px");
});

test("on the right, with no room before the scrollbar, the dashes go against the scrollbar's edge", async () => {
  await show("right");
  layout([0, 1200], [0, 1200], [300, 1190]);
  const reader = host.querySelector<HTMLElement>(".reader")!;
  Object.defineProperty(reader, "offsetWidth", { value: 1200, configurable: true });
  Object.defineProperty(reader, "clientWidth", { value: 1185, configurable: true });
  await over(rows()[0]);
  expect(place().dataset.margin).toBeUndefined();
  expect(place().style.left).toBe("1163px");
  expect(host.querySelector<HTMLElement>(".edge")!.style.getPropertyValue("--panel-right")).toBe("43px");
});

test("on the left the dashes sit in the margin before the text, and the panel opens rightward from there", async () => {
  await show("left");
  layout([0, 1200], [250, 1200], [400, 1000]);
  await over(rows()[0]);
  // The text starts at 440; the dashes end 16 px before it.
  expect(place().dataset.margin).toBe("true");
  expect(place().dataset.side).toBe("left");
  expect(place().style.left).toBe("402px");
  expect(host.querySelector<HTMLElement>(".edge")!.style.getPropertyValue("--panel-left")).toBe("430px");
});

test("on the left, with no room before the text, the dashes go against the document's edge beside the sidebar", async () => {
  await show("left");
  layout([0, 1200], [250, 1200], [230, 1000]);
  await over(rows()[0]);
  expect(place().dataset.margin).toBeUndefined();
  expect(place().style.left).toBe("250px");
  expect(host.querySelector<HTMLElement>(".edge")!.style.getPropertyValue("--panel-left")).toBe("278px");
});

test("with no text column to sit beside, the dashes go against the document's edge", async () => {
  await show("left");
  host.querySelector(".doc-column")!.remove();
  host.querySelector<HTMLElement>(".reader")!.getBoundingClientRect = () => box(250, 1200);
  await over(rows()[0]);
  expect(place().style.left).toBe("250px");
});
