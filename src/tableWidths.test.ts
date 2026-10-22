import { expect, test } from "vitest";
import { headerKey, MAX_FILES, savedWidths, withWidth, withWidths, type TableWidths } from "./tableWidths";

const H = ["Task", "Status", "Result"];

test("a width is saved per file and table, and back to automatic removes it", () => {
  let s: TableWidths = {};
  s = withWidth(s, "/d/a.md", 1, H, 2, 20.456);
  expect(savedWidths(s, "/d/a.md", 1, H)).toEqual([null, null, 20.46]);
  expect(savedWidths(s, "/d/a.md", 0, H)).toBeUndefined();
  expect(savedWidths(s, "/d/b.md", 1, H)).toBeUndefined();
  s = withWidth(s, "/d/a.md", 1, H, 0, 8);
  expect(savedWidths(s, "/d/a.md", 1, H)).toEqual([8, null, 20.46]);
  s = withWidth(s, "/d/a.md", 1, H, 0, null);
  s = withWidth(s, "/d/a.md", 1, H, 2, null);
  expect(s).toEqual({});
});

test("widths aren't applied to a table whose header changed", () => {
  const s = withWidth({}, "/d/a.md", 0, H, 1, 10);
  expect(savedWidths(s, "/d/a.md", 0, ["Task", "State", "Result"])).toBeUndefined();
  expect(savedWidths(s, "/d/a.md", 0, [...H, "More"])).toBeUndefined();
  // Spacing in a header doesn't count as a change.
  expect(savedWidths(s, "/d/a.md", 0, [" Task", "Status ", "Result"])).toEqual([null, 10, null]);
  // Setting a width on the changed table starts over.
  const changed = withWidth(s, "/d/a.md", 0, ["Task", "State", "Result"], 0, 5);
  expect(changed["/d/a.md"][0]).toEqual({ header: headerKey(["Task", "State", "Result"]), widths: [5, null, null] });
});

test("Windows paths ignore case", () => {
  const s = withWidth({}, "C:\\Docs\\A.md", 0, H, 0, 9);
  expect(savedWidths(s, "c:\\docs\\a.MD", 0, H)).toEqual([9, null, null]);
});

test("only the most recently changed files are kept", () => {
  let s: TableWidths = {};
  for (let i = 0; i <= MAX_FILES; i++) s = withWidth(s, `/d/${i}.md`, 0, H, 0, 5);
  expect(Object.keys(s)).toHaveLength(MAX_FILES);
  expect(savedWidths(s, "/d/0.md", 0, H)).toBeUndefined();
  // Changing a file makes it the most recent.
  s = withWidth(s, "/d/1.md", 0, H, 1, 6);
  s = withWidth(s, "/d/new.md", 0, H, 0, 5);
  expect(savedWidths(s, "/d/1.md", 0, H)).toEqual([5, 6, null]);
  expect(savedWidths(s, "/d/2.md", 0, H)).toBeUndefined();
});

test("all of a table's widths are saved at once", () => {
  const s = withWidths({}, "/d/a.md", 0, H, [10.123, null, 30]);
  expect(savedWidths(s, "/d/a.md", 0, H)).toEqual([10.12, null, 30]);
  expect(withWidths(s, "/d/a.md", 0, H, [null, null, null])).toEqual({});
});
