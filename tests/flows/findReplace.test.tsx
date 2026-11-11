// @vitest-environment jsdom
// Find and replace through the whole App: the options in the reading view, Replace and Replace all while editing,
// regular expression groups, an invalid pattern, and Source mode.
import { EditorView } from "@codemirror/view";
import { act } from "react";
import { afterEach, beforeEach, expect, test } from "vitest";
import { click, FILE, launch, press, setUpFlow, tearDownFlow, until, type Flow } from "../support/appFlow";

let flow: Flow;
const NOTE = "Title\n=====\n\n* a word here\n* another word\n\nA word and $x^2$ in a paragraph.\n";

beforeEach(() => {
  flow = setUpFlow({ [FILE]: NOTE });
});

afterEach(tearDownFlow);

const q = <E extends HTMLElement = HTMLElement>(selector: string) => flow.host.querySelector<E>(selector);
const count = () => q(".find-count")?.textContent;
const button = (name: string) => [...flow.host.querySelectorAll<HTMLButtonElement>(".find button")].find((b) => b.textContent?.trim() === name);
const option = (label: string) => q<HTMLButtonElement>(`.find button[aria-label^="${label}"]`)!;
const editorText = () => q(".ProseMirror")?.textContent ?? "";

async function typeIn(selector: string, text: string) {
  const el = q<HTMLInputElement>(selector)!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, text);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function startEditing() {
  await press("e", { ctrlKey: true });
  await until(() => q(".ProseMirror p") && !q("article.doc"), "the editor in place of the reading view");
}

test("the reading view's find has the options and stays find-only", async () => {
  await launch(flow);
  await press("h", { ctrlKey: true });
  expect(q(".find")).not.toBeNull();
  expect(q("#replace-input")).toBeNull();
  expect(q(".find-expand")).toBeNull();
  await typeIn("#find-input", "WORD");
  await until(() => count() === "1 of 3", "three matches");
  await press("c", { altKey: true }, q("#find-input")!);
  expect(option("Match case").getAttribute("aria-pressed")).toBe("true");
  expect(count()).toBe("No results");
  await press("c", { altKey: true }, q("#find-input")!);
  await press("w", { altKey: true }, q("#find-input")!);
  await typeIn("#find-input", "wor");
  expect(count()).toBe("No results");
  await press("w", { altKey: true }, q("#find-input")!);
  await press("r", { altKey: true }, q("#find-input")!);
  expect(option("Regular expression").getAttribute("aria-pressed")).toBe("true");
  await typeIn("#find-input", "an(other)?");
  expect(count()).toBe("1 of 2");
});

test("the options stay set when find closes and opens again", async () => {
  await launch(flow);
  await press("f", { ctrlKey: true });
  await click(option("Whole word"));
  await press("Escape");
  expect(q(".find")).toBeNull();
  await press("f", { ctrlKey: true });
  expect(option("Whole word").getAttribute("aria-pressed")).toBe("true");
});

test("Replace replaces the current match and moves to the next; the save keeps the other blocks as written", async () => {
  await launch(flow, { autosave: false });
  await startEditing();
  await press("h", { ctrlKey: true });
  expect(q(".find-expand")?.getAttribute("aria-expanded")).toBe("true");
  await typeIn("#find-input", "word");
  await typeIn("#replace-input", "words");
  await until(() => count() === "1 of 3", "three matches");
  await click(button("Replace"));
  expect(editorText()).toContain("a words here");
  // The new text matches too, but the next match is the one after it.
  expect(count()).toBe("2 of 3");
  await click(button("Replace"));
  expect(editorText()).toContain("another words");
  await press("s", { ctrlKey: true });
  await until(() => flow.disk.get(FILE) !== NOTE, "the save");
  expect(flow.disk.get(FILE)).toBe("Title\n=====\n\n* a words here\n* another words\n\nA word and $x^2$ in a paragraph.\n");
});

test("Replace all is one undo step, and formulas match by their source", async () => {
  await launch(flow, { autosave: false });
  await startEditing();
  await press("h", { ctrlKey: true });
  await typeIn("#find-input", "x^2");
  await until(() => count() === "1 of 1", "the formula");
  await typeIn("#find-input", "word");
  await typeIn("#replace-input", "term");
  await until(() => count() === "1 of 3", "three matches");
  await click(button("Replace all"));
  expect(count()).toBe("Replaced 3");
  expect(editorText()).not.toContain("word");
  await press("z", { ctrlKey: true }, q(".ProseMirror")!);
  await until(() => (editorText().match(/word/g) ?? []).length === 3, "one undo to bring every match back");
  expect(editorText()).not.toContain("term");
});

test("regular expression groups in the replacement, in Source mode", async () => {
  await launch(flow, { autosave: false });
  await press("M", { ctrlKey: true, shiftKey: true });
  await until(() => q(".cm-editor"), "the source");
  await press("f", { ctrlKey: true });
  expect(q("#replace-input")).toBeNull();
  await click(q(".find-expand"));
  await click(option("Regular expression"));
  await typeIn("#find-input", "^\\* (?<first>\\w+) (\\w+)");
  await typeIn("#replace-input", "- $2 $<first>");
  await until(() => count() === "1 of 2", "the list items");
  expect(q(".cm-searchMatch-selected")?.textContent).toBe("* a word");
  await click(button("Replace all"));
  const view = EditorView.findFromDOM(q(".cm-editor")!)!;
  expect(view.state.doc.toString()).toBe("Title\n=====\n\n- word a here\n- word another\n\nA word and $x^2$ in a paragraph.\n");
  await press("z", { ctrlKey: true }, q(".cm-content")!);
  expect(view.state.doc.toString()).toBe(NOTE);
});

test("an invalid pattern shows its error and finds nothing", async () => {
  await launch(flow);
  await startEditing();
  await press("h", { ctrlKey: true });
  await click(option("Regular expression"));
  await typeIn("#find-input", "(word");
  expect(count()).toBe("Unterminated group");
  expect(q("#find-input")?.getAttribute("aria-invalid")).toBe("true");
  expect(q(".find-match")).toBeNull();
  expect(button("Replace all")?.disabled).toBe(true);
  await typeIn("#find-input", "(word)");
  await until(() => count() === "1 of 3", "the fixed pattern");
  expect(q("#find-input")?.getAttribute("aria-invalid")).toBe("false");
});
