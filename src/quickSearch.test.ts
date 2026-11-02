import { expect, test } from "vitest";
import { moveActive, pathParts, quickResults, QUICK_LIMIT } from "./quickSearch";
import type { WorkspaceDoc } from "./workspaces";

const doc = (relative: string): WorkspaceDoc => ({ path: `C:\w\${relative}`, root: "C:\w", relative });

test("path parts mark every occurrence of every word and separate the file name from its folders", () => {
  expect(pathParts("audit/Economy.md", ["audit", "econ"])).toEqual([
    { text: "audit", match: true, name: false },
    { text: "/", match: false, name: false },
    { text: "Econ", match: true, name: true },
    { text: "omy.md", match: false, name: true },
  ]);
  expect(pathParts("a/b.md", [])).toEqual([
    { text: "a/", match: false, name: false },
    { text: "b.md", match: false, name: true },
  ]);
  expect(pathParts("aaa.md", ["a"])[0]).toEqual({ text: "aaa", match: true, name: true });
});

test("a path whose lower case has another length is shown with nothing marked", () => {
  expect(pathParts("İ.md", ["i"]).some((p) => p.match)).toBe(false);
});

test("an empty query lists the documents, and results are cut at the limit with the rest counted", () => {
  const many = Array.from({ length: 15000 }, (_, i) => doc(`f${i % 10}/n${i}.md`));
  const all = quickResults(many, "");
  expect(all.items).toHaveLength(QUICK_LIMIT);
  expect(all.more).toBe(15000 - QUICK_LIMIT);
  const some = quickResults(many, "f3 n1");
  expect(some.items.length + some.more).toBe(many.filter((d) => d.relative.includes("f3") && d.relative.includes("n1")).length);
  expect(quickResults(many, "nothing like this")).toEqual({ items: [], more: 0 });
});

test("the active result stops at either end", () => {
  expect(moveActive(3, 0, -1)).toBe(0);
  expect(moveActive(3, 2, 1)).toBe(2);
  expect(moveActive(3, 0, 1)).toBe(1);
  expect(moveActive(0, 0, 1)).toBe(0);
});
