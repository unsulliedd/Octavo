// @vitest-environment jsdom
import { history, undo } from "@codemirror/commands";
import { EditorState, Text } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { expect, test } from "vitest";
import { compileQuery, NO_OPTIONS, replacement, type FindOptions, type Query } from "@/reading/find";
import { findInText, findMatches, sourceFind } from "@/source/sourceFind";

const q = (query: string, options: Partial<FindOptions> = {}) => compileQuery(query, { ...NO_OPTIONS, ...options }) as Query;

function editor(text: string) {
  const parent = document.createElement("div");
  document.body.append(parent);
  const view = new EditorView({ parent, state: EditorState.create({ doc: text, extensions: [history(), findMatches] }) });
  let live = true;
  const listeners = new Set<() => void>();
  return { view, parent, target: sourceFind(() => (live ? view : undefined), listeners), close: () => ((live = false), view.destroy()) };
}

test("each line is searched on its own, with positions in the whole text", () => {
  const doc = Text.of(["# Title", "one two", "two", "", "end two"]);
  expect(findInText(doc, q("two")).map((f) => [f.from, f.to])).toEqual([
    [12, 15],
    [16, 19],
    [25, 28],
  ]);
  expect(findInText(doc, q("two two"))).toEqual([]);
  expect(findInText(doc, q("^two$", { regex: true })).map((f) => f.from)).toEqual([16]);
  expect(findInText(doc, q("two"), 2)).toHaveLength(2);
});

test("Replace all with regex groups is one change and one undo step", () => {
  const { view, target, close } = editor("John Smith\nJane Doe\n");
  const query = q("^(\\w+) (\\w+)$", { regex: true });
  const found = target.find(query, Infinity);
  target.replace!(
    found,
    found.map((f) => replacement("$2, $1", f.match, true)),
  );
  expect(view.state.doc.toString()).toBe("Smith, John\nDoe, Jane\n");
  undo(view);
  expect(view.state.doc.toString()).toBe("John Smith\nJane Doe\n");
  close();
});

test("Replace returns where the new text ends; matches are painted and cleared", () => {
  const { view, parent, target, close } = editor("cat cat");
  const [first] = target.find(q("cat"), Infinity);
  expect(target.replace!([first], ["cats"])).toBe(4);
  expect(view.state.doc.toString()).toBe("cats cat");
  const found = target.find(q("cat"), Infinity);
  target.show(found, 1, true);
  expect(parent.querySelectorAll(".cm-searchMatch")).toHaveLength(2);
  expect(parent.querySelector(".cm-searchMatch-selected")?.textContent).toBe("cat");
  target.clear();
  expect(parent.querySelector(".cm-searchMatch")).toBeNull();
  close();
  expect(target.find(q("cat"), Infinity)).toEqual([]);
  expect(() => target.clear()).not.toThrow();
});
