// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { NO_TABS, openTab, activate, type Tabs } from "./tabs";
import { tabListItems, useTabOverflow, wheelShift } from "./tabStrip";
import { useRef } from "react";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLElement;
let root: Root;
let sizes: { scrollWidth: number; clientWidth: number; scrollLeft: number };
let observers: { callback: () => void; disconnected: boolean; target?: Element }[];

function Strip({ count }: { count: number }) {
  const strip = useRef<HTMLElement>(null);
  const overflowing = useTabOverflow(strip, count);
  return (
    <>
      <nav ref={strip} data-testid="strip" />
      {overflowing && <button>list</button>}
    </>
  );
}

const strip = () => host.querySelector("nav") as HTMLElement;
const listed = () => !!host.querySelector("button");

async function show(count: number) {
  await act(async () => root.render(<Strip count={count} />));
}

function fakeObserver() {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      entry: (typeof observers)[number] = { callback: () => {}, disconnected: false };
      constructor(callback: () => void) {
        this.entry.callback = callback;
        observers.push(this.entry);
      }
      observe(target: Element) {
        this.entry.target = target;
      }
      disconnect() {
        this.entry.disconnected = true;
      }
    },
  );
}

beforeEach(() => {
  sizes = { scrollWidth: 300, clientWidth: 500, scrollLeft: 0 };
  observers = [];
  for (const key of ["scrollWidth", "clientWidth", "scrollLeft"] as const)
    Object.defineProperty(HTMLElement.prototype, key, { configurable: true, get: () => sizes[key], set: (v) => (sizes[key] = v) });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  for (const key of ["scrollWidth", "clientWidth", "scrollLeft"]) delete (HTMLElement.prototype as unknown as Record<string, unknown>)[key];
});

const wheel = (deltaY: number, deltaX = 0) => {
  const e = new WheelEvent("wheel", { deltaY, deltaX, cancelable: true, bubbles: true });
  strip().dispatchEvent(e);
  return e;
};

test("tabs that fit show no list button, and a missing ResizeObserver is no error", async () => {
  expect(typeof ResizeObserver).toBe("undefined");
  await show(3);
  expect(listed()).toBe(false);
});

test("tabs that run past the strip show the list button, re-checked when the tab count changes", async () => {
  await show(3);
  sizes.scrollWidth = 800;
  await show(4);
  expect(listed()).toBe(true);
  sizes.scrollWidth = 400;
  await show(3);
  expect(listed()).toBe(false);
});

test("a resize of the strip re-checks it", async () => {
  fakeObserver();
  await show(3);
  expect(listed()).toBe(false);
  expect(observers.map((o) => o.target)).toEqual([strip()]);
  sizes.clientWidth = 200;
  await act(async () => observers.forEach((o) => o.callback()));
  expect(listed()).toBe(true);
});

test("a window resize re-checks it", async () => {
  await show(3);
  sizes.clientWidth = 200;
  await act(async () => window.dispatchEvent(new Event("resize")));
  expect(listed()).toBe(true);
});

test("the observer is released when the strip goes away", async () => {
  fakeObserver();
  await show(3);
  act(() => root.render(null));
  expect(observers.every((o) => o.disconnected)).toBe(true);
});

test("a vertical wheel over an overflowing strip scrolls it sideways and not the page", async () => {
  sizes.scrollWidth = 800;
  await show(5);
  const e = wheel(100);
  expect(e.defaultPrevented).toBe(true);
  expect(sizes.scrollLeft).toBe(100);
});

test("the wheel is left alone when the tabs fit or the turn is sideways", async () => {
  await show(3);
  expect(wheel(100).defaultPrevented).toBe(false);
  sizes.scrollWidth = 800;
  await show(5);
  expect(wheel(10, 100).defaultPrevented).toBe(false);
  expect(sizes.scrollLeft).toBe(0);
});

test("wheelShift picks the dominant vertical turn", () => {
  expect(wheelShift(0, 120)).toBe(120);
  expect(wheelShift(0, -120)).toBe(-120);
  expect(wheelShift(120, 10)).toBe(0);
});

test("the list has every tab, the shown one checked, the unsaved ones marked, and picking one shows it", () => {
  let s: Tabs = NO_TABS;
  for (const p of ["C:\\a\\one.md", "C:\\a\\two.md", "C:\\a\\three.md"]) s = openTab(s, p);
  s = activate(s, s.tabs[1].id);
  const shown: number[] = [];
  const items = tabListItems(s, s.active, (p) => p.endsWith("three.md"), (id) => shown.push(id));
  expect(items.map((i) => (i === "separator" ? i : i.checked))).toEqual([false, true, false]);
  act(() =>
    root.render(
      <>
        {items.map((i, n) => (
          <div key={n} data-n={n}>
            {i !== "separator" && i.label}
          </div>
        ))}
      </>,
    ),
  );
  expect([...host.children].map((c) => c.textContent)).toEqual(["one.md", "two.md", "three.md"]);
  expect([...host.children].map((c) => !!c.querySelector(".unsaved-dot"))).toEqual([false, false, true]);
  (items[2] as { run: () => void }).run();
  expect(shown).toEqual([s.tabs[2].id]);
});
