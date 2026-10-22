import { expect, test } from "vitest";
import { diffLines, foldUnchanged, splitLines, type DiffLine } from "./lineDiff";

const show = (d: DiffLine[]) => d.map((l) => ({ same: " ", del: "-", add: "+" })[l.kind] + l.text).join("\n");
/** Applying a diff's lines gives back both versions. */
function check(a: string[], b: string[]) {
  const d = diffLines(a, b);
  expect(d.filter((l) => l.kind !== "add").map((l) => l.text)).toEqual(a);
  expect(d.filter((l) => l.kind !== "del").map((l) => l.text)).toEqual(b);
  return d;
}

test("finds changed, added and removed lines", () => {
  expect(show(check(["a", "b", "c", "d"], ["a", "x", "c", "d", "e"]))).toBe(" a\n-b\n+x\n c\n d\n+e");
  expect(show(check(["a", "b"], ["a", "b"]))).toBe(" a\n b");
  expect(show(check([], ["a"]))).toBe("+a");
  expect(show(check(["a"], []))).toBe("-a");
});

test("keeps the diff small when lines move", () => {
  const d = check(["1", "2", "3", "4", "5", "6"], ["1", "3", "4", "2", "5", "6"]);
  expect(d.filter((l) => l.kind !== "same")).toHaveLength(2);
});

test("random edits round-trip", () => {
  let seed = 7;
  const rand = (n: number) => ((seed = (seed * 1103515245 + 12345) % 2 ** 31), seed % n);
  for (let i = 0; i < 50; i++) {
    const a = Array.from({ length: rand(30) }, () => String(rand(6)));
    const b = a.filter(() => rand(4) > 0).flatMap((l) => (rand(5) ? [l] : [l, String(rand(6))]));
    check(a, b);
  }
});

test("splits text into lines whatever the line endings", () => {
  expect(splitLines("a\r\nb\r\n")).toEqual(["a", "b"]);
  expect(splitLines("a\nb")).toEqual(["a", "b"]);
});

test("folds long unchanged runs around changes", () => {
  const a = Array.from({ length: 20 }, (_, i) => `l${i}`);
  const b = a.map((l) => (l === "l10" ? "changed" : l));
  const view = foldUnchanged(diffLines(a, b), 2);
  expect(view.map((l) => (l.kind === "skip" ? `skip ${l.count}` : `${l.kind} ${l.text}`))).toEqual([
    "skip 8",
    "same l8",
    "same l9",
    "del l10",
    "add changed",
    "same l11",
    "same l12",
    "skip 7",
  ]);
});
