// Editing the table the cursor is in: rows, columns and column alignment.

import type { Ctx } from "@milkdown/kit/ctx";
import { addRowWithAlignment } from "@milkdown/kit/preset/gfm";
import { TextSelection, type EditorState, type Transaction } from "@milkdown/kit/prose/state";
import {
  addColumn,
  deleteColumn,
  deleteRow,
  deleteTable,
  isInTable,
  selectedRect,
  TableMap,
  type TableRect,
} from "@milkdown/kit/prose/tables";
import { canRun, type Align, type TableAction, type TableInfo } from "./tableInfo";

export function tableAt(state: EditorState): TableInfo | undefined {
  if (!isInTable(state)) return undefined;
  const rect = selectedRect(state);
  const header = rect.table.nodeAt(rect.map.map[rect.left]);
  const align = header?.attrs.alignment;
  return {
    headerRow: rect.top === 0,
    rows: rect.map.height,
    columns: rect.map.width,
    align: align === "center" || align === "right" ? align : "left",
  };
}

/** Position of the table the cursor is in, for finding its element. */
export const tablePos = (state: EditorState) => (isInTable(state) ? selectedRect(state).tableStart - 1 : undefined);

/**
 * Runs `action` on the table the cursor is in. Left alignment is written without a colon, as GFM
 * aligns columns left by default.
 */
export function runTableAction(ctx: Ctx, action: TableAction, state: EditorState, dispatch: (tr: Transaction) => void) {
  if (!canRun(action, tableAt(state))) return false;
  const rect = selectedRect(state);
  switch (action) {
    case "rowAbove":
      dispatch(moveTo(addRowWithAlignment(ctx, state.tr, rect, rect.top), rect.tableStart, rect.top, rect.left));
      return true;
    case "rowBelow":
      dispatch(moveTo(addRowWithAlignment(ctx, state.tr, rect, rect.bottom), rect.tableStart, rect.bottom, rect.left));
      return true;
    case "columnLeft":
      dispatch(moveTo(insertColumn(state.tr, rect, rect.left), rect.tableStart, rect.top, rect.left));
      return true;
    case "columnRight":
      dispatch(moveTo(insertColumn(state.tr, rect, rect.right), rect.tableStart, rect.top, rect.right));
      return true;
    case "deleteRow":
      return deleteRow(state, dispatch);
    case "deleteColumn":
      return deleteColumn(state, dispatch);
    case "deleteTable":
      return deleteTable(state, dispatch);
    default: {
      const align = action === "alignCenter" ? "center" : action === "alignRight" ? "right" : null;
      dispatch(alignColumn(state.tr, rect.tableStart, rect.left, align));
      return true;
    }
  }
}

/** Puts the cursor in the cell at `row`, `col` of the table starting at `tableStart`, so typing fills a new row or column. */
function moveTo(tr: Transaction, tableStart: number, row: number, col: number) {
  const table = tr.doc.nodeAt(tableStart - 1);
  if (!table) return tr;
  const map = TableMap.get(table);
  const offset = map.map[row * map.width + col];
  return offset === undefined ? tr : tr.setSelection(TextSelection.near(tr.doc.resolve(tableStart + offset + 1)));
}

/** Inserts an empty column at `col`, without an alignment of its own. */
function insertColumn(tr: Transaction, rect: TableRect, col: number) {
  addColumn(tr, rect, col);
  return alignColumn(tr, rect.tableStart, col, null);
}

/** Sets the alignment of every cell in column `col` of the table starting at `tableStart`. */
function alignColumn(tr: Transaction, tableStart: number, col: number, align: Align | null) {
  const table = tr.doc.nodeAt(tableStart - 1);
  if (!table) return tr;
  const map = TableMap.get(table);
  for (let row = 0; row < map.height; row++) {
    const offset = map.map[row * map.width + col];
    const cell = table.nodeAt(offset);
    if (cell) tr.setNodeMarkup(tableStart + offset, undefined, { ...cell.attrs, alignment: align });
  }
  return tr;
}
