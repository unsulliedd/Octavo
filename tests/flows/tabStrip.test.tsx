// @vitest-environment jsdom
// The tab strip through the whole App: dragging tabs, middle click, the list of every tab and the tab menu.
import { EditorView } from "@codemirror/view";
import { act } from "react";
import { afterEach, beforeEach, expect, test } from "vitest";
import { click, FILE, launch, OTHER, press, setUpFlow, tabNames, tearDownFlow, until, type Flow } from "../support/appFlow";

let flow: Flow;
const THIRD = "C:\\docs\\third.md";

beforeEach(() => {
  flow = setUpFlow({ [FILE]: "# Note\n\nText.\n", [OTHER]: "# Other\n\nMore.\n", [THIRD]: "# Third\n\nText.\n" });
});

const rect = Element.prototype.getBoundingClientRect;
afterEach(async () => {
  Element.prototype.getBoundingClientRect = rect;
  await tearDownFlow();
});

const q = (selector: string) => flow.host.querySelector<HTMLElement>(selector);
const tab = (name: string) => [...flow.host.querySelectorAll<HTMLElement>(".tab")].find((t) => t.textContent === name)!;

/** Launches with three tabs: note, other, third. */
async function threeTabs(prefs: object = {}) {
  await launch(flow, prefs);
  for (const file of [OTHER, THIRD]) {
    flow.picked = file;
    await press("o", { ctrlKey: true });
    await until(() => tabNames(flow).includes(file.split("\\").pop()!), file);
  }
  // Each tab is 100 pixels wide, side by side.
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const tabs = [...document.querySelectorAll(".tab")];
    const i = tabs.indexOf(this);
    return i < 0 ? new DOMRect() : new DOMRect(i * 100, 0, 100, 30);
  };
}

const pointer = (type: string, x: number, target: EventTarget = window) =>
  act(async () => void target.dispatchEvent(new MouseEvent(type, { button: 0, clientX: x, bubbles: true })));

test("dragging a tab past another's middle moves it, and Escape puts it back", async () => {
  await threeTabs();
  await pointer("pointerdown", 50, tab("note.md"));
  await pointer("pointermove", 160);
  expect(tabNames(flow)).toEqual(["other.md", "note.md", "third.md"]);
  expect(tab("note.md").dataset.dragging).toBe("true");
  await pointer("pointermove", 260);
  expect(tabNames(flow)).toEqual(["other.md", "third.md", "note.md"]);
  await press("Escape");
  expect(tabNames(flow)).toEqual(["note.md", "other.md", "third.md"]);
  expect(tab("note.md").dataset.dragging).toBeUndefined();
  expect(q('.tab[aria-current="page"]')?.textContent).toBe("third.md");
});

test("releasing a dragged tab keeps the new order", async () => {
  await threeTabs();
  await pointer("pointerdown", 250, tab("third.md"));
  await pointer("pointermove", 40);
  await pointer("pointerup", 40);
  expect(tabNames(flow)).toEqual(["third.md", "note.md", "other.md"]);
  await pointer("pointermove", 260);
  expect(tabNames(flow)).toEqual(["third.md", "note.md", "other.md"]);
});

test("a middle click closes a tab", async () => {
  await threeTabs();
  await act(async () => void tab("other.md").dispatchEvent(new MouseEvent("auxclick", { button: 1, bubbles: true })));
  await until(() => tabNames(flow).length === 2, "the tab to close");
  expect(tabNames(flow)).toEqual(["note.md", "third.md"]);
});

test("the list of every tab shows a tab", async () => {
  Object.defineProperty(HTMLElement.prototype, "scrollWidth", { configurable: true, get: () => 1000 });
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 100 });
  try {
    await threeTabs();
    await click(q('button[aria-label="All open documents"]'));
    const item = [...flow.host.querySelectorAll<HTMLElement>('[role="menu"] button')].find((b) => b.textContent?.includes("note.md"));
    await click(item);
    expect(q('.tab[aria-current="page"]')?.textContent).toBe("note.md");
    expect(q('[role="menu"]')).toBeNull();
  } finally {
    delete (HTMLElement.prototype as { scrollWidth?: number }).scrollWidth;
    delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
  }
});

test("the tab menu's Close and Close others save unsaved edits first", async () => {
  const questions: string[] = [];
  flow.answer = (text, labels) => (questions.push(text), labels[0]);
  await threeTabs({ autosave: false });
  await click(tab("note.md").querySelector(".tab-open"));
  await press("M", { ctrlKey: true, shiftKey: true });
  await until(() => q(".cm-editor"), "the source");
  const view = EditorView.findFromDOM(q(".cm-editor")!)!;
  await act(async () => void view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: "# Note\n\nChanged.\n" } }));
  const menu = async (name: string, item: string) => {
    await act(async () => void tab(name).dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 10, clientY: 10 })));
    await click([...flow.host.querySelectorAll('[role="menu"] button')].find((b) => b.textContent?.startsWith(item)));
  };
  await menu("third.md", "Close others");
  await until(() => tabNames(flow).length === 1, "the other tabs to close");
  expect(tabNames(flow)).toEqual(["third.md"]);
  expect(questions).toEqual(["Save your changes to note.md before closing?"]);
  expect(flow.disk.get(FILE)).toBe("# Note\n\nChanged.\n");
  await menu("third.md", "Close");
  await until(() => tabNames(flow).length === 0, "the last tab to close");
});
