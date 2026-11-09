// @vitest-environment jsdom
import { expect, test } from "vitest";
import { render } from "@/reading/render";
import { enableTaskBoxes, toggleTask } from "@/reading/taskBoxes";

/** The offsets render puts on the task boxes of `md`, in document order. */
async function offsets(md: string) {
  const html = await render(md, "/d", String);
  return [...html.matchAll(/data-task-offset="(\d+)"/g)].map((m) => Number(m[1]));
}

/** What each box offset in `md` points at. */
const boxesAt = async (md: string) => (await offsets(md)).map((at) => md.slice(at, at + 3));

test("each task box carries where its brackets start in the file", async () => {
  const md = "- [ ] one\n* [x] two\n+ [X] three\n\n1. [ ] four\n2) [x] five\n";
  const at = await offsets(md);
  expect(at).toEqual([md.indexOf("[ ] one"), md.indexOf("[x] two"), md.indexOf("[X] three"), md.indexOf("[ ] four"), md.indexOf("[x] five")]);
});

test("nested lists, block quotes, loose lists and CRLF files", async () => {
  const md = "- [ ] a\r\n  - [x] b\r\n    1. [ ] c\r\n\r\n> - [ ] d\r\n>   > * [X] e\r\n\r\n- [ ] loose\r\n\r\n- [x] items\r\n";
  expect(await boxesAt(md)).toEqual(["[ ]", "[x]", "[ ]", "[ ]", "[X]", "[ ]", "[x]"]);
  const at = await offsets(md);
  expect(at[1]).toBe(md.indexOf("[x] b"));
  expect(at[4]).toBe(md.indexOf("[X] e"));
  expect(at[6]).toBe(md.indexOf("[x] items"));
});

test("a box in a table, a code block or raw HTML isn't a task", async () => {
  const md = "| a |\n|---|\n| [ ] x |\n\n```\n- [ ] code\n```\n\n    - [ ] indented\n\n<ul><li class=\"task-list-item\"><input type=\"checkbox\"> raw</li></ul>\n\n- [ ] real\n";
  expect(await offsets(md)).toEqual([md.indexOf("[ ] real")]);
});

test("offsets stay in the file's text when `$` are escaped for parsing, and with a byte order mark", async () => {
  const md = "Costs $0.89 and $2.97 today.\n\n- [ ] pay $5 for $x$\n- [x] done\n";
  expect(await boxesAt(md)).toEqual(["[ ]", "[x]"]);
  expect(await boxesAt("﻿- [ ] first\n")).toEqual(["[ ]"]);
});

test("offsets survive raw HTML elsewhere in the document", async () => {
  const md = "<b>bold</b>\n\n- [ ] a <i>b</i>\n- [x] c\n";
  expect(await boxesAt(md)).toEqual(["[ ]", "[x]"]);
});

test("toggleTask changes one character, and only on a box", () => {
  expect(toggleTask("- [ ] a\r\n", 2)).toBe("- [x] a\r\n");
  expect(toggleTask("- [x] a", 2)).toBe("- [ ] a");
  expect(toggleTask("- [X] a", 2)).toBe("- [ ] a");
  expect(toggleTask("- [ ] a", 1)).toBeUndefined();
  expect(toggleTask("- [y] a", 2)).toBeUndefined();
  expect(toggleTask("- [", 2)).toBeUndefined();
});

test("enableTaskBoxes names the boxes by their item's own text, focuses one, and undoes", async () => {
  const root = document.createElement("article");
  root.innerHTML = await render("- [ ] Buy *milk*\n  - [x] nested\n", "/d", String);
  document.body.append(root);
  const [outer, inner] = root.querySelectorAll<HTMLInputElement>("input");
  expect(outer.disabled).toBe(true);
  const undo = enableTaskBoxes(root, Number(inner.dataset.taskOffset));
  expect(outer.disabled).toBe(false);
  expect(outer.getAttribute("aria-label")).toBe("Buy milk");
  expect(inner.getAttribute("aria-label")).toBe("nested");
  expect(document.activeElement).toBe(inner);
  undo();
  expect(outer.disabled).toBe(true);
  expect(outer.hasAttribute("aria-label")).toBe(false);
  root.remove();
});
