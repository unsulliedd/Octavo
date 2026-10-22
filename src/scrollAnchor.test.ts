import { expect, test } from "vitest";
import { anchorAt, scrollTopFor } from "./scrollAnchor";

test("the anchor is the last heading at or above the top, and the distance below it", () => {
  expect(anchorAt([0, 500, 1200], 800, 3000)).toEqual({ heading: 1, offset: 300 });
  expect(anchorAt([0, 500, 1200], 500, 3000)).toEqual({ heading: 1, offset: 0 });
  expect(anchorAt([0, 500, 1200], 2000, 3000)).toEqual({ heading: 2, offset: 800 });
});

test("above the first heading, or without headings, the position is a fraction of the height", () => {
  expect(anchorAt([300, 900], 150, 3000)).toEqual({ fraction: 0.05 });
  expect(anchorAt([], 1500, 3000)).toEqual({ fraction: 0.5 });
  expect(anchorAt([], 0, 0)).toEqual({ fraction: 0 });
});

test("the other view scrolls to the same heading, offset alike", () => {
  expect(scrollTopFor({ heading: 1, offset: 300 }, [0, 540, 1300], 3200)).toBe(840);
  expect(scrollTopFor({ fraction: 0.5 }, [], 4000)).toBe(2000);
  // The other view has fewer headings (one was deleted while editing): use the last one there is.
  expect(scrollTopFor({ heading: 3, offset: 10 }, [0, 400], 1000)).toBe(410);
  expect(scrollTopFor({ heading: 0, offset: 10 }, [], 1000)).toBe(0);
});
