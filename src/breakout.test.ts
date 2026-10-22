import { expect, test } from "vitest";
import { breakout } from "./breakout";

test("a block that fits the column stays as it is", () => {
  expect(breakout(700, 720, 400, 400)).toBeUndefined();
  expect(breakout(720, 720, 400, 400)).toBeUndefined();
});

test("a wider block grows evenly to both sides", () => {
  expect(breakout(1000, 720, 400, 400)).toEqual({ width: 1000, reach: 140 });
});

test("it grows no wider than the reading area, and scrolls inside that", () => {
  expect(breakout(3000, 720, 400, 400)).toEqual({ width: 1520, reach: 400 });
});

test("with less room on one side it reaches further to the other", () => {
  expect(breakout(1000, 720, 400, 40)).toEqual({ width: 1000, reach: 240 });
  expect(breakout(1000, 720, 40, 400)).toEqual({ width: 1000, reach: 40 });
  // A narrow window: no room beside the column.
  expect(breakout(1000, 720, -10, -10)).toBeUndefined();
});
