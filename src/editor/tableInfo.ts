// What the table bar shows and allows. Kept free of editor code, so the bar is part of the startup bundle without the editor.

export type Align = "left" | "center" | "right";
export type TableAction =
  | "rowAbove"
  | "rowBelow"
  | "columnLeft"
  | "columnRight"
  | "deleteRow"
  | "deleteColumn"
  | "deleteTable"
  | "alignLeft"
  | "alignCenter"
  | "alignRight";

/**
 * What can be done to the table the cursor is in. The header row stays first, and a table keeps one
 * column and one row below the header.
 */
export type TableInfo = { headerRow: boolean; rows: number; columns: number; align: Align };

/** Whether `action` applies to the table the cursor is in. */
export function canRun(action: TableAction, info: TableInfo | undefined) {
  if (!info) return false;
  if (action === "rowAbove") return !info.headerRow;
  if (action === "deleteRow") return !info.headerRow && info.rows > 2;
  if (action === "deleteColumn") return info.columns > 1;
  return true;
}
