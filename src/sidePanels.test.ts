import { expect, test } from "vitest";
import { HEADING_DASHES, outlineDashes, RAIL_GAP, RAIL_WIDTH, railPlace } from "./sidePanels";

const bounds = { left: 100, right: 1000 };

test("a heading's dash is shorter for a lower level, and the current one is marked", () => {
  const dashes = outlineDashes(
    [
      { id: "a", level: 1, text: "a" },
      { id: "b", level: 2, text: "b" },
      { id: "c", level: 3, text: "c" },
      { id: "d", level: 4, text: "d" },
    ],
    "b",
  );
  expect(dashes.map((d) => d.w)).toEqual([13, 10, 7, 4]);
  expect(dashes.map((d) => d.active)).toEqual([false, true, false, false]);
});

test("a document with no headings has no dashes", () => {
  expect(outlineDashes([], undefined)).toEqual([]);
});

test("more headings than the cap show the ones around the current heading", () => {
  const headings = Array.from({ length: 100 }, (_, i) => ({ id: `h${i}`, level: 2, text: `Heading ${i}` }));
  const first = outlineDashes(headings, "h0");
  expect(first).toHaveLength(HEADING_DASHES);
  expect(first[0].active).toBe(true);
  const middle = outlineDashes(headings, "h50");
  expect(middle).toHaveLength(HEADING_DASHES);
  expect(middle.findIndex((d) => d.active)).toBe(HEADING_DASHES / 2);
  const last = outlineDashes(headings, "h99");
  expect(last[HEADING_DASHES - 1].active).toBe(true);
  expect(outlineDashes(headings, undefined)).toHaveLength(HEADING_DASHES);
});

test("a dash keeps its heading's place and text, whatever the cap leaves out", () => {
  const headings = Array.from({ length: 100 }, (_, i) => ({ id: `h${i}`, level: 2, text: `Heading ${i}` }));
  const middle = outlineDashes(headings, "h50");
  expect(middle[0]).toMatchObject({ index: 30, text: "Heading 30" });
  expect(middle[HEADING_DASHES / 2]).toMatchObject({ index: 50, active: true, text: "Heading 50" });
});

test("on the right the dashes go in the margin just past the text when it has room", () => {
  expect(railPlace("right", 700, bounds)).toEqual({ x: 700 + RAIL_GAP, margin: true });
  expect(railPlace("right", 1000 - RAIL_GAP - RAIL_WIDTH, bounds)).toEqual({ x: 1000 - RAIL_WIDTH, margin: true });
});

test("on the right, with no room before the scrollbar or no text column, they go against the right edge", () => {
  expect(railPlace("right", 1000 - RAIL_GAP - RAIL_WIDTH + 1, bounds)).toEqual({ x: 1000 - RAIL_WIDTH, margin: false });
  expect(railPlace("right", undefined, bounds)).toEqual({ x: 1000 - RAIL_WIDTH, margin: false });
});

test("on the left the dashes go in the margin just before the text when it has room", () => {
  expect(railPlace("left", 400, bounds)).toEqual({ x: 400 - RAIL_GAP - RAIL_WIDTH, margin: true });
  expect(railPlace("left", 100 + RAIL_GAP + RAIL_WIDTH, bounds)).toEqual({ x: 100, margin: true });
});

test("on the left, with no room before the text or no text column, they go against the document's left edge, beside the sidebar", () => {
  expect(railPlace("left", 100 + RAIL_GAP + RAIL_WIDTH - 1, bounds)).toEqual({ x: 100, margin: false });
  expect(railPlace("left", undefined, bounds)).toEqual({ x: 100, margin: false });
});
