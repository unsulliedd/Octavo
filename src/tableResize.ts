// Resizing table columns in the reading view by dragging the border between header cells.

import type { Widths } from "./tableWidths";

/** Narrowest a column can be dragged to, in px. */
const MIN_WIDTH = 40;

/** The header cells' text of a table. */
export const headersOf = (table: HTMLTableElement) => [...(table.rows[0]?.cells ?? [])].map((c) => c.textContent ?? "");

/**
 * Gives a table's columns their widths in em. A table with widths is laid out at exactly those widths
 * and is as wide as their sum; with none (all null) it goes back to its automatic layout.
 */
export function applyWidths(table: HTMLTableElement, widths: Widths) {
  const sized = widths.length > 0 && widths.every((w) => w !== null);
  const header = [...(table.rows[0]?.cells ?? [])];
  table.classList.toggle("sized", sized);
  table.style.width = sized ? `${widths.reduce((sum: number, w) => sum + w!, 0)}em` : "";
  header.forEach((cell, i) => {
    cell.style.width = sized ? `${widths[i]}em` : "";
  });
}

/** The widths in em set on a table's columns: all null for a table at its automatic layout. */
export function currentWidths(table: HTMLTableElement): Widths {
  return [...(table.rows[0]?.cells ?? [])].map((cell) => (cell.style.width.endsWith("em") ? parseFloat(cell.style.width) : null));
}

/**
 * Adds a drag handle to the right edge of every header cell in `root`. Dragging resizes the column as
 * the pointer moves; the other columns keep their widths, so the table grows or shrinks with it. A
 * double-click returns the table to its automatic layout. Either way `onResize` gets the table's column
 * widths afterwards. Returns a function that stops listening.
 */
export function addResizeHandles(root: HTMLElement, onResize: (table: HTMLTableElement, widths: Widths) => void) {
  for (const table of root.querySelectorAll("table")) {
    for (const cell of table.rows[0]?.cells ?? []) {
      if (cell.querySelector(":scope > .col-resize")) continue;
      const handle = document.createElement("span");
      handle.className = "col-resize";
      handle.setAttribute("aria-hidden", "true");
      handle.title = "Drag to resize the column, double-click for the table's automatic layout";
      cell.append(handle);
    }
  }
  const target = (e: Event) => {
    const handle = (e.target as HTMLElement).closest?.(".col-resize");
    const cell = handle?.parentElement as HTMLTableCellElement | null;
    const table = cell?.closest("table");
    return handle && cell && table ? { handle: handle as HTMLElement, cell, table } : undefined;
  };
  const onDown = (e: PointerEvent) => {
    const hit = target(e);
    if (!hit || e.button !== 0) return;
    e.preventDefault();
    const { handle, cell, table } = hit;
    const column = cell.cellIndex;
    const em = parseFloat(getComputedStyle(table).fontSize) || 16;
    // Every column keeps the width it has now, so only the dragged one changes as the pointer moves.
    const before = currentWidths(table);
    const widths = [...(table.rows[0]?.cells ?? [])].map((c) => c.getBoundingClientRect().width / em);
    applyWidths(table, widths);
    const start = widths[column] * em;
    const x = e.clientX;
    let moved = false;
    handle.setPointerCapture(e.pointerId);
    table.classList.add("resizing");
    const move = (m: PointerEvent) => {
      moved = true;
      widths[column] = Math.max(MIN_WIDTH, start + m.clientX - x) / em;
      applyWidths(table, widths);
    };
    const up = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", up);
      table.classList.remove("resizing");
      if (moved) onResize(table, currentWidths(table));
      else applyWidths(table, before);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", up);
  };
  const onDouble = (e: MouseEvent) => {
    const hit = target(e);
    if (!hit) return;
    e.preventDefault();
    applyWidths(hit.table, currentWidths(hit.table).map(() => null));
    onResize(hit.table, currentWidths(hit.table));
  };
  root.addEventListener("pointerdown", onDown);
  root.addEventListener("dblclick", onDouble);
  return () => {
    root.removeEventListener("pointerdown", onDown);
    root.removeEventListener("dblclick", onDouble);
  };
}
