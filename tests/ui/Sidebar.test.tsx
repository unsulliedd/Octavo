// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Sidebar } from "@/ui/Sidebar";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLElement;
let root: Root;
let saved: number[];

function Harness({ start }: { start: number }) {
  const [width, setWidth] = useState(start);
  return (
    <Sidebar
      width={width}
      onWidth={(next) => {
        saved.push(next);
        setWidth(next);
      }}
    >
      <p>Files</p>
    </Sidebar>
  );
}

async function show(start = 252) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<Harness start={start} />));
}

const aside = () => host.querySelector<HTMLElement>(".sidebar")!;
const handle = () => host.querySelector<HTMLElement>("[role=separator]")!;
const fire = (event: Event) => act(async () => void handle().dispatchEvent(event));
const pointer = (type: string, clientX: number, button = 0) => fire(new MouseEvent(type, { bubbles: true, cancelable: true, clientX, button }));
async function key(name: string) {
  const event = new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true });
  await fire(event);
  return event;
}
async function resizeWindow(width: number) {
  window.innerWidth = width;
  await act(async () => void window.dispatchEvent(new Event("resize")));
}

beforeEach(() => {
  saved = [];
  window.innerWidth = 1280;
  Element.prototype.setPointerCapture = () => {};
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

test("the handle is a labelled, focusable separator that gives the width", async () => {
  await show(300);
  expect(aside().style.width).toBe("300px");
  expect(handle().getAttribute("aria-label")).toBe("Sidebar width");
  expect(handle().getAttribute("aria-orientation")).toBe("vertical");
  expect(handle().getAttribute("aria-valuenow")).toBe("300");
  expect(handle().getAttribute("aria-valuemin")).toBe("180");
  expect(handle().getAttribute("aria-valuemax")).toBe("480");
  expect(handle().tabIndex).toBe(0);
});

test("the arrow keys move the edge and save each step", async () => {
  await show();
  const event = await key("ArrowRight");
  expect(event.defaultPrevented).toBe(true);
  expect(aside().style.width).toBe("268px");
  await key("ArrowLeft");
  await key("ArrowLeft");
  expect(saved).toEqual([268, 252, 236]);
});

test("other keys are left alone", async () => {
  await show();
  const event = await key("ArrowUp");
  expect(event.defaultPrevented).toBe(false);
  expect(saved).toEqual([]);
});

test("the arrow keys stop at the limits", async () => {
  await show(186);
  await key("ArrowLeft");
  await key("ArrowLeft");
  expect(saved).toEqual([180, 180]);
  await resizeWindow(760);
  await key("ArrowRight");
  expect(aside().style.width).toBe("196px");
  await resizeWindow(700);
  await key("ArrowRight");
  expect(aside().style.width).toBe("180px");
});

test("a drag follows the pointer and saves once, when it ends", async () => {
  await show();
  await pointer("pointerdown", 252);
  await pointer("pointermove", 300);
  expect(aside().style.width).toBe("300px");
  await pointer("pointermove", 340);
  expect(aside().style.width).toBe("340px");
  expect(saved).toEqual([]);
  await pointer("pointerup", 340);
  expect(saved).toEqual([340]);
  await pointer("pointermove", 400);
  expect(aside().style.width).toBe("340px");
});

test("a drag stops at the limits and saves what shows", async () => {
  await show();
  await pointer("pointerdown", 252);
  await pointer("pointermove", 2000);
  expect(aside().style.width).toBe("480px");
  await pointer("pointerup", 2000);
  expect(saved).toEqual([480]);
});

test("a press without a move saves nothing, and only the main button drags", async () => {
  await show();
  await pointer("pointerdown", 252);
  await pointer("pointerup", 252);
  await pointer("pointerdown", 252, 2);
  await pointer("pointermove", 300);
  expect(aside().style.width).toBe("252px");
  expect(saved).toEqual([]);
});

test("a double-click goes back to the usual width", async () => {
  await show(400);
  await fire(new MouseEvent("dblclick", { bubbles: true }));
  expect(aside().style.width).toBe("252px");
  expect(saved).toEqual([252]);
});

test("a narrower window shrinks the sidebar, and the saved width comes back as it grows", async () => {
  await show(480);
  await resizeWindow(800);
  expect(aside().style.width).toBe("280px");
  expect(handle().getAttribute("aria-valuemax")).toBe("280");
  await resizeWindow(1280);
  expect(aside().style.width).toBe("480px");
  expect(saved).toEqual([]);
});

test("a floating panel has no handle, takes its saved width and says where it came from", async () => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<Sidebar floating={{ side: "right", label: "Outline" }} width={300}><p>Headings</p></Sidebar>));
  expect(host.querySelector("[role=separator]")).toBeNull();
  expect(aside().dataset.floating).toBe("right");
  expect(aside().getAttribute("aria-label")).toBe("Outline");
  expect(aside().style.width).toBe("300px");
});

test("a sidebar with no way to change its width ignores the handle", async () => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<Sidebar width={252}><p>Files</p></Sidebar>));
  await key("ArrowRight");
  await fire(new MouseEvent("dblclick", { bubbles: true }));
  expect(aside().style.width).toBe("252px");
});
