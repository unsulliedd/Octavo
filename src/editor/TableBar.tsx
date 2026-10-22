import { Icon } from "../icons";
import { canRun, type TableAction, type TableInfo } from "./tableInfo";

type Props = {
  table: TableInfo;
  /** Where the table is in the editor pane. */
  box: { top: number; left: number; height: number };
  /** Down the table's left side, following the scroll within the table, instead of above it. */
  side: boolean;
  onAction: (action: TableAction) => void;
};

const GROUPS: { action: TableAction; label: string }[][] = [
  [
    { action: "rowAbove", label: "Insert a row above" },
    { action: "rowBelow", label: "Insert a row below" },
    { action: "deleteRow", label: "Delete this row" },
  ],
  [
    { action: "columnLeft", label: "Insert a column to the left" },
    { action: "columnRight", label: "Insert a column to the right" },
    { action: "deleteColumn", label: "Delete this column" },
  ],
  [
    { action: "alignLeft", label: "Align the column left" },
    { action: "alignCenter", label: "Center the column" },
    { action: "alignRight", label: "Align the column right" },
  ],
  [{ action: "deleteTable", label: "Delete the table" }],
];

const ALIGN: Partial<Record<TableAction, TableInfo["align"]>> = { alignLeft: "left", alignCenter: "center", alignRight: "right" };

/** Shown while the cursor is in a table: row, column and alignment actions for that table. */
export function TableBar({ table, box, side, onAction }: Props) {
  // The buttons keep the editor's selection, so the action applies where the cursor is.
  const keepFocus = (e: React.MouseEvent) => e.preventDefault();
  // The bar floats over the text above the table, or beside it, so the page doesn't move when it appears.
  // On the side, the anchor is as tall as the table and the bar sticks to the top of the view inside it.
  return (
    <div className="table-bar-anchor" data-side={side || undefined} style={side ? box : { top: box.top }}>
      <div className="table-bar" role="toolbar" aria-label="Table" aria-orientation={side ? "vertical" : undefined} onMouseDown={keepFocus}>
        {GROUPS.map((group, i) => (
          <span key={i} className="table-bar-group">
            {group.map((b) => (
              <button
                key={b.action}
                className={b.action === "deleteTable" ? "icon-btn danger" : "icon-btn"}
                aria-label={b.label}
                title={b.label}
                aria-pressed={ALIGN[b.action] ? table.align === ALIGN[b.action] : undefined}
                disabled={!canRun(b.action, table)}
                onClick={() => onAction(b.action)}
              >
                <Icon name={b.action} />
              </button>
            ))}
          </span>
        ))}
      </div>
    </div>
  );
}
