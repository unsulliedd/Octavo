// @vitest-environment jsdom
// The reading view through the whole App: find, links, the code copy button, the large view and the outline.
import { EditorView } from "@codemirror/view";
import { act } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { calls, click, FILE, launch, OTHER, press, setUpFlow, tabNames, tearDownFlow, until, type Flow } from "../support/appFlow";

let flow: Flow;
const THIRD = "C:\\docs\\third.md";
const NOTE = [
  "# Title",
  "Original text here.",
  "[Jump](#section) [Web](https://example.com/page) [Third](third.md)",
  "```js\nconst x = 1;\n```",
  "| a | b |\n|---|---|\n| 1 | 2 |",
  "## Section",
  "More.",
  "",
].join("\n\n");

beforeEach(() => {
  flow = setUpFlow({ [FILE]: NOTE, [OTHER]: "# Other\n\nMore.\n", [THIRD]: "# Third\n\nText.\n" });
});

afterEach(tearDownFlow);

const q = (selector: string) => flow.host.querySelector<HTMLElement>(selector);
const scrolled = () => {
  const targets: Element[] = [];
  Element.prototype.scrollIntoView = function (this: Element) {
    targets.push(this);
  } as never;
  return targets;
};

test("find opens with a one-line selection as its query and closes on Escape", async () => {
  await launch(flow);
  const range = document.createRange();
  range.selectNodeContents(q(".doc p")!.firstChild!);
  range.setEnd(range.startContainer, "Original".length);
  getSelection()!.removeAllRanges();
  getSelection()!.addRange(range);
  await click(q('button[aria-label="Find in document (Ctrl+F)"]'));
  expect((q("#find-input") as HTMLInputElement).value).toBe("Original");
  await press("Escape");
  expect(q(".find")).toBeNull();
});

test("a fragment link scrolls, a web link goes to the browser, a .md link opens a tab next to its own", async () => {
  flow.picked = OTHER;
  await launch(flow);
  await press("o", { ctrlKey: true });
  await until(() => tabNames(flow).length === 2, "the second tab");
  await click(q(".tab .tab-open"));
  await until(() => q(".breadcrumb")?.textContent?.endsWith("note.md"), "the first tab");
  const targets = scrolled();
  await click(q('.doc a[href="#section"]'));
  expect(targets.map((t) => t.id)).toEqual(["section"]);
  await click(q('.doc a[href^="https:"]'));
  await until(() => calls(flow, "plugin:opener|open_url").length, "the browser");
  expect(calls(flow, "plugin:opener|open_url")[0].args.url).toBe("https://example.com/page");
  await click(q('.doc a[href="third.md"]'));
  await until(() => tabNames(flow).length === 3, "the linked document");
  expect(tabNames(flow)).toEqual(["note.md", "third.md", "other.md"]);
});

test("the code copy button writes the code to the clipboard", async () => {
  const writeText = vi.fn(async () => {});
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  await launch(flow);
  await click(q(".code-copy"));
  expect(writeText).toHaveBeenCalledWith("const x = 1;\n");
  await until(() => q(".code-copy")?.textContent === "Copied", "the copied label");
});

test("the large view closes when another tab is shown", async () => {
  flow.picked = OTHER;
  await launch(flow);
  await press("o", { ctrlKey: true });
  await until(() => tabNames(flow).length === 2, "the second tab");
  await click(q(".tab .tab-open"));
  await until(() => q(".table-scroll .large-open"), "the open button");
  await click(q(".table-scroll .large-open"));
  await until(() => document.querySelector(".large-panel"), "the large view");
  await click(flow.host.querySelectorAll(".tab .tab-open")[1]);
  await until(() => !document.querySelector(".large-panel"), "the large view to close");
});

test("an outline link scrolls to its heading in reading, editing and Source", async () => {
  await launch(flow);
  let targets = scrolled();
  await click(flow.host.querySelectorAll(".outline a")[1]);
  expect(targets.map((t) => t.id)).toEqual(["section"]);

  await press("e", { ctrlKey: true });
  await until(() => q('.outline a[href="#editor-heading-1"]'), "the editor's outline");
  targets = scrolled();
  await click(flow.host.querySelectorAll(".outline a")[1]);
  expect(targets).toEqual([flow.host.querySelectorAll(".ProseMirror h2")[0]]);

  await press("M", { ctrlKey: true, shiftKey: true });
  await until(() => q('.outline a[href="#source-heading-1"]'), "the source outline");
  await click(flow.host.querySelectorAll(".outline a")[1]);
  const view = EditorView.findFromDOM(q(".cm-editor")!)!;
  await act(async () => {});
  expect(view.state.selection.main.head).toBe(NOTE.indexOf("## Section"));
});
