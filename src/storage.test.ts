import { expect, test } from "vitest";
import { lineWidth, openLarge, recentFiles } from "./storage";

test("a stored line width is kept; anything else is the default width", () => {
  expect(lineWidth("wider")).toBe("wider");
  expect(lineWidth("narrow")).toBe("narrow");
  expect(lineWidth("widest")).toBe("default");
  expect(lineWidth(undefined)).toBe("default");
  expect(lineWidth(3)).toBe("default");
});

test("a stored way of opening diagrams and images large is kept; anything else is both", () => {
  expect(openLarge("button")).toBe("button");
  expect(openLarge("click")).toBe("click");
  expect(openLarge("both")).toBe("both");
  expect(openLarge("hover")).toBe("both");
  expect(openLarge(undefined)).toBe("both");
});

test("recent files keep only entries with a path and a time", () => {
  const file = { path: "C:/notes/a.md", at: 1 };
  expect(recentFiles([file, "C:/notes/b.md", { path: "C:/notes/c.md" }, null, 4])).toEqual([file]);
  expect(recentFiles("junk")).toEqual([]);
  expect(recentFiles(undefined)).toEqual([]);
});
