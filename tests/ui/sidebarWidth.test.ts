import { expect, test } from "vitest";
import { DEFAULT_SIDEBAR, MIN_SIDEBAR, sidebarWidth, storedSidebarWidth } from "@/ui/sidebarWidth";

test("a width inside the limits stays as it is", () => {
  expect(sidebarWidth(300, 1280)).toBe(300);
  expect(sidebarWidth(MIN_SIDEBAR, 1280)).toBe(MIN_SIDEBAR);
});

test("the sidebar can't be narrower or wider than its limits", () => {
  expect(sidebarWidth(40, 1280)).toBe(MIN_SIDEBAR);
  expect(sidebarWidth(2000, 3000)).toBe(480);
});

test("the window leaves the document its width first", () => {
  expect(sidebarWidth(480, 900)).toBe(380);
  expect(sidebarWidth(480, 1000)).toBe(480);
});

test("in a very narrow window the sidebar keeps its smallest width", () => {
  expect(sidebarWidth(300, 600)).toBe(MIN_SIDEBAR);
});

test("a stored width is kept; anything else is the default width", () => {
  expect(storedSidebarWidth(310)).toBe(310);
  for (const v of ["310", null, undefined, NaN, Infinity]) expect(storedSidebarWidth(v)).toBe(DEFAULT_SIDEBAR);
});
