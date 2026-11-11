// @vitest-environment jsdom
import { expect, test } from "vitest";
import { createEditor } from "@/editor/session";
import { compileQuery, NO_OPTIONS, replacement, type FindOptions, type Query } from "@/reading/find";

const open = async (markdown: string) => {
  const root = document.createElement("div");
  document.body.append(root);
  return { root, s: await createEditor(root, markdown, { imageUrl: String, onChange: () => {} }) };
};
const q = (query: string, options: Partial<FindOptions> = {}) => compileQuery(query, { ...NO_OPTIONS, ...options }) as Query;

/** Replaces every match of `query` with `template`, as Replace all does. */
function replaceAll(s: Awaited<ReturnType<typeof open>>["s"], query: Query, template: string, regex = false) {
  const found = s.find.find(query, Infinity);
  s.find.replace!(
    found,
    found.map((f) => replacement(template, f.match, regex)),
  );
  return found.length;
}

test("formulas match by their source, before they are drawn, and are replaced through their source", async () => {
  const { s } = await open("Area $x^2$ and $y^2$.\n\n$$\nx + 1\n$$\n");
  expect(s.find.find(q("x"), Infinity).map((f) => f.match[0])).toEqual(["x", "x"]);
  expect(replaceAll(s, q("x"), "r")).toBe(2);
  expect(s.markdown()).toBe("Area $r^2$ and $y^2$.\n\n$$\nr + 1\n$$\n");
  // Two matches in one formula both change.
  expect(replaceAll(s, q("\\d", { regex: true }), "($&)", true)).toBe(3);
  expect(s.markdown()).toBe("Area $r^(2)$ and $y^(2)$.\n\n$$\nr + (1)\n$$\n");
  await s.destroy();
});

test("matches stay in their block: paragraph, list item, table cell, code block", async () => {
  const { s } = await open("one\ntwo\n\n- one\n- two\n\n| one | two |\n|---|---|\n| one | two |\n\n```\none\ntwo\n```\n");
  // A soft line break is part of the paragraph and of the code block; blocks never join.
  expect(s.find.find(q("one two"), Infinity).map((f) => f.match[0])).toEqual(["one\ntwo", "one\ntwo"]);
  expect(s.find.find(q("two"), Infinity)).toHaveLength(5);
  await s.destroy();
});

test("Replace keeps the marks of the text it replaces, and Replace all is one undo step", async () => {
  const { s } = await open("Some **bold word** and [a word](https://x.test) and `word`.\n\nAnother word.\n");
  expect(replaceAll(s, q("word"), "term")).toBe(4);
  expect(s.markdown()).toBe("Some **bold term** and [a term](https://x.test) and `term`.\n\nAnother term.\n");
  s.formatAction("undo");
  expect(s.markdown()).toBe("Some **bold word** and [a word](https://x.test) and `word`.\n\nAnother word.\n");
  await s.destroy();
});

test("an empty replacement deletes the match, and a match across a line break joins the lines", async () => {
  const { s } = await open("keep this\\\nand that\n");
  expect(replaceAll(s, q("this\\s+and", { regex: true }), "+", true)).toBe(1);
  expect(s.markdown()).toBe("keep + that\n");
  expect(replaceAll(s, q(" \\+", { regex: true }), "", true)).toBe(1);
  expect(s.markdown()).toBe("keep that\n");
  await s.destroy();
});

test("a replacement that keeps a matched line break keeps its kind: hard stays hard, soft stays soft", async () => {
  const { s } = await open("keep this\\\nand that\n\nsoft one\nsoft two\n");
  expect(replaceAll(s, q("this\\s+and", { regex: true }), "($&)", true)).toBe(1);
  expect(replaceAll(s, q("one\\s+soft", { regex: true }), "($&)", true)).toBe(1);
  expect(s.markdown()).toBe("keep (this\\\nand) that\n\nsoft (one\nsoft) two\n");
  await s.destroy();
});

test("Replace returns where the new text ends, so a match the new text makes is not the next one", async () => {
  const { s } = await open("cat cat\n");
  const [first] = s.find.find(q("cat"), Infinity);
  const end = s.find.replace!([first], ["cats"]);
  const next = s.find.find(q("cat"), Infinity);
  expect(next.map((f) => f.from)).toEqual([1, 6]);
  expect(next.findIndex((f) => f.from >= end)).toBe(1);
  await s.destroy();
});

test("matches are painted as decorations, the current one marked, and cleared", async () => {
  const { root, s } = await open("alpha beta alpha $alpha$\n");
  const found = s.find.find(q("alpha"), Infinity);
  expect(found).toHaveLength(3);
  s.find.show(found, 1, true);
  expect([...root.querySelectorAll(".find-match")].map((el) => el.textContent)).toEqual(["alpha", "alpha", expect.any(String)]);
  expect(root.querySelector(".find-current")?.textContent).toBe("alpha");
  expect(root.querySelector('[data-type="math_inline"].find-match')).not.toBeNull();
  s.find.clear();
  expect(root.querySelector(".find-match")).toBeNull();
  // Showing matches is not an edit.
  expect(s.edited()).toBe(false);
  await s.destroy();
});

test("a replacement saves only the blocks it changed", async () => {
  const base = "Title\n=====\n\n* one\n* two\n\nA paragraph with a word.\n\n|a|b|\n|-|-|\n|1|2|\n";
  const { s } = await open(base);
  replaceAll(s, q("word"), "term");
  const snap = s.snapshot(base);
  expect(snap.exact).toBe(true);
  expect(snap.markdown).toBe(base.replace("word", "term"));
  await s.destroy();
});

test("the target does nothing once the editor is gone, and hears of changes until then", async () => {
  const { s } = await open("text\n");
  let changes = 0;
  const stop = s.find.watch!(() => changes++);
  replaceAll(s, q("text"), "more");
  expect(changes).toBe(1);
  stop();
  replaceAll(s, q("more"), "less");
  expect(changes).toBe(1);
  await s.destroy();
  expect(s.find.find(q("less"), Infinity)).toEqual([]);
  expect(() => s.find.clear()).not.toThrow();
});
