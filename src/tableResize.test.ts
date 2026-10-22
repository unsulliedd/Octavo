// @vitest-environment jsdom
import { expect, test } from "vitest";
import { addResizeHandles, applyWidths, currentWidths, headersOf } from "./tableResize";

function doc() {
  const root = document.createElement("article");
  root.innerHTML =
    "<div class='table-scroll'><table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td class='cell-short'>1</td><td>2</td></tr></tbody></table></div>";
  return { root, table: root.querySelector("table")! };
}

test("a table with widths is laid out at them and as wide as their sum", () => {
  const { table } = doc();
  applyWidths(table, [8, 12.5]);
  expect(table.classList.contains("sized")).toBe(true);
  expect(table.style.width).toBe("20.5em");
  expect([...table.rows[0].cells].map((c) => c.style.width)).toEqual(["8em", "12.5em"]);
  expect(currentWidths(table)).toEqual([8, 12.5]);
});

test("without widths, or with only some, a table keeps its automatic layout", () => {
  const { table } = doc();
  applyWidths(table, [8, 12.5]);
  applyWidths(table, [null, null]);
  expect(table.classList.contains("sized")).toBe(false);
  expect(table.style.width).toBe("");
  expect(currentWidths(table)).toEqual([null, null]);
  applyWidths(table, [8, null]);
  expect(table.classList.contains("sized")).toBe(false);
});

test("each header cell gets one handle, and its text stays the header text", () => {
  const { root, table } = doc();
  const stop = addResizeHandles(root, () => {});
  addResizeHandles(root, () => {})();
  expect(root.querySelectorAll(".col-resize")).toHaveLength(2);
  expect(headersOf(table)).toEqual(["A", "B"]);
  stop();
});

test("double-clicking a handle returns the table to its automatic layout", () => {
  const { root, table } = doc();
  applyWidths(table, [8, 12]);
  const calls: unknown[] = [];
  const stop = addResizeHandles(root, (t, widths) => calls.push([t === table, widths]));
  root.querySelector(".col-resize")!.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
  expect(calls).toEqual([[true, [null, null]]]);
  expect(table.classList.contains("sized")).toBe(false);
  stop();
});
