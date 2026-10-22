import { expect, test } from "vitest";
import { fitZoom, indentLines, stepZoom, svgSize } from "./mermaid";

const apply = (text: string, r: { from: number; to: number; text: string }) => text.slice(0, r.from) + r.text + text.slice(r.to);

test("Tab inserts four spaces at the cursor; with a selection it indents every touched line", () => {
  const text = "graph TD\nA --> B\nB --> C";
  const cursor = indentLines(text, 9, 9, false);
  expect(apply(text, cursor)).toBe("graph TD\n    A --> B\nB --> C");
  expect(cursor).toMatchObject({ start: 13, end: 13 });
  const lines = indentLines(text, 11, 20, false);
  expect(apply(text, lines)).toBe("graph TD\n    A --> B\n    B --> C");
  expect(lines).toMatchObject({ start: 9, end: 9 + "    A --> B\n    B --> C".length });
  // A selection ending at the start of a line leaves that line alone.
  expect(apply(text, indentLines(text, 9, 17, false))).toBe("graph TD\n    A --> B\nB --> C");
});

test("Shift+Tab removes up to four leading spaces from every touched line", () => {
  const text = "graph TD\n      A --> B\n  B --> C\nC --> D";
  expect(apply(text, indentLines(text, 12, 30, true))).toBe("graph TD\n  A --> B\nB --> C\nC --> D");
  const cursor = indentLines(text, 15, 15, true);
  expect(apply(text, cursor)).toBe("graph TD\n  A --> B\n  B --> C\nC --> D");
  expect(cursor).toMatchObject({ start: 11, end: 11 });
  expect(apply(text, indentLines(text, 36, 36, true))).toBe(text);
});

test("wheel zoom moves in slider steps between 10% and 400%", () => {
  expect(stepZoom(1, true)).toBe(1.15);
  expect(stepZoom(1, false)).toBe(0.85);
  expect(stepZoom(0.1, true)).toBe(0.15);
  expect(stepZoom(0.1, false)).toBe(0.1);
  expect(stepZoom(4, true)).toBe(4);
});

test("a diagram's size comes from its viewBox", () => {
  expect(svgSize('<svg id="d" viewBox="-8 -8 1240.5 960" style="max-width: 1240.5px">')).toEqual({ width: 1240.5, height: 960 });
  expect(svgSize("<svg width='10'>")).toBeUndefined();
});

test("the starting zoom fits the diagram in the preview, never enlarging it", () => {
  expect(fitZoom({ width: 2000, height: 1000 }, { width: 700, height: 800 })).toBe(0.35);
  expect(fitZoom({ width: 400, height: 1600 }, { width: 700, height: 800 })).toBe(0.5);
  expect(fitZoom({ width: 300, height: 200 }, { width: 700, height: 800 })).toBe(1);
  expect(fitZoom({ width: 100000, height: 100 }, { width: 700, height: 800 })).toBe(0.1);
});
