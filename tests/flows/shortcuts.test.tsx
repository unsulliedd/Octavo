// @vitest-environment jsdom
// Every window shortcut through the whole App, each once from the keyboard with its effect.
import { EditorView } from "@codemirror/view";
import { act } from "react";
import { afterEach, beforeEach, expect, test } from "vitest";
import { calls, click, FILE, launch, OTHER, press, setUpFlow, tabNames, tearDownFlow, until, type Flow } from "../support/appFlow";

let flow: Flow;
const NOTE = "# Title\n\nOriginal text.\n\n[Other](other.md)\n\n| a | b |\n|---|---|\n| 1 | 2 |\n";

beforeEach(() => {
  flow = setUpFlow({ [FILE]: NOTE, [OTHER]: "# Other\n\nMore.\n" });
});

afterEach(tearDownFlow);

const q = (selector: string) => flow.host.querySelector<HTMLElement>(selector);
const activeTab = () => q('.tab[aria-current="page"] .tab-open span:last-child')?.textContent;
const breadcrumb = () => q(".breadcrumb")?.textContent;

test("Ctrl+O opens the file picker and the picked file", async () => {
  flow.picked = OTHER;
  await launch(flow);
  await press("o", { ctrlKey: true });
  await until(() => tabNames(flow).length === 2, "the picked file");
  expect(calls(flow, "plugin:dialog|open")).toHaveLength(1);
  expect(activeTab()).toBe("other.md");
});

test("Ctrl+F opens find, Ctrl+P quick open", async () => {
  await launch(flow);
  await press("f", { ctrlKey: true });
  expect(q(".find")).not.toBeNull();
  await press("p", { ctrlKey: true });
  expect(document.querySelector('[aria-label="Quick open"]')).not.toBeNull();
});

test("Ctrl+\\ shows and hides the sidebar", async () => {
  await launch(flow);
  expect(q(".sidebar")).not.toBeNull();
  await press("\\", { ctrlKey: true });
  expect(q(".sidebar")).toBeNull();
  expect(q('button[aria-label="Show sidebar"]')?.getAttribute("aria-pressed")).toBe("false");
  await press("\\", { ctrlKey: true });
  expect(q(".sidebar")).not.toBeNull();
});

test("Ctrl+W closes the tab and Ctrl+Shift+T reopens it", async () => {
  await launch(flow);
  await press("w", { ctrlKey: true });
  await until(() => tabNames(flow).length === 0, "the tab to close");
  await press("T", { ctrlKey: true, shiftKey: true });
  await until(() => tabNames(flow).length === 1, "the tab to reopen");
  expect(tabNames(flow)).toEqual(["note.md"]);
});

test("Ctrl+Tab and Ctrl+Shift+Tab go to the next and previous tab", async () => {
  flow.picked = OTHER;
  await launch(flow);
  await press("o", { ctrlKey: true });
  await until(() => activeTab() === "other.md", "the second tab");
  await press("Tab", { ctrlKey: true });
  expect(activeTab()).toBe("note.md");
  await press("Tab", { ctrlKey: true, shiftKey: true });
  expect(activeTab()).toBe("other.md");
});

test("Alt+Left and Alt+Right go back and forward in a tab", async () => {
  await launch(flow);
  await click(q('.doc a[href="other.md"]'));
  await until(() => breadcrumb()?.endsWith("other.md"), "the linked document");
  await press("ArrowLeft", { altKey: true });
  await until(() => breadcrumb()?.endsWith("note.md"), "back");
  await press("ArrowRight", { altKey: true });
  await until(() => breadcrumb()?.endsWith("other.md"), "forward");
});

test("Ctrl+E edits and ends editing, Ctrl+Shift+P previews, Ctrl+Shift+M shows the source", async () => {
  await launch(flow);
  await press("e", { ctrlKey: true });
  await until(() => q(".ProseMirror"), "the editor");
  await press("P", { ctrlKey: true, shiftKey: true });
  await until(() => !q(".ProseMirror") && q("article.doc"), "the preview");
  expect(q('.mode-switch button[aria-pressed="true"]')?.textContent).toBe("Preview");
  await press("M", { ctrlKey: true, shiftKey: true });
  await until(() => q(".cm-editor"), "the source");
  expect(q('.mode-switch button[aria-pressed="true"]')?.textContent).toBe("Source");
  await press("e", { ctrlKey: true });
  await until(() => q(".edit-btn"), "the session to end");
  expect(q(".mode-switch")).toBeNull();
});

test("Ctrl+S saves the edits and Ctrl+Shift+S asks where to save", async () => {
  await launch(flow, { autosave: false });
  await press("M", { ctrlKey: true, shiftKey: true });
  await until(() => q(".cm-editor"), "the source");
  const view = EditorView.findFromDOM(q(".cm-editor")!)!;
  await act(async () => void view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: "# Title\n\nChanged.\n" } }));
  await press("s", { ctrlKey: true });
  await until(() => flow.disk.get(FILE) === "# Title\n\nChanged.\n", "the save");
  await press("S", { ctrlKey: true, shiftKey: true });
  await until(() => calls(flow, "plugin:dialog|save").length === 1, "the Save As dialog");
});

test("F11 starts distraction-free mode and Escape ends it", async () => {
  await launch(flow);
  await press("F11");
  expect(q(".app")?.dataset.focus).toBe("true");
  await press("Escape");
  expect(q(".app")?.dataset.focus).toBeUndefined();
});

test("a key the editor already handled does nothing in the window", async () => {
  await launch(flow);
  const handled = (e: Event) => e.preventDefault();
  window.addEventListener("keydown", handled, true);
  await press("w", { ctrlKey: true });
  window.removeEventListener("keydown", handled, true);
  expect(tabNames(flow)).toEqual(["note.md"]);
});

test("window keys wait while the large view is open", async () => {
  await launch(flow);
  await until(() => q(".table-scroll .large-open"), "the open button");
  await click(q(".table-scroll .large-open"));
  await until(() => document.querySelector(".large-panel"), "the large view");
  await press("w", { ctrlKey: true });
  expect(tabNames(flow)).toEqual(["note.md"]);
  expect(document.querySelector(".large-panel")).not.toBeNull();
});
