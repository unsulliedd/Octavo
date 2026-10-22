import type { Prefs } from "../storage";

/** Where the editing tools go, from the placement settings. */
export type EditorLayout = {
  /** The formatting bar row under the toolbar. */
  barRow: boolean;
  /** The formatting bar that floats over selected text. */
  floating: boolean;
  /** Discard, Save as and Save in the formatting bar row; otherwise in the toolbar. */
  actionsInBar: boolean;
  /** Where the save status shows while editing. */
  status: "status" | "toolbar" | "bar";
  /** The link at the cursor shows in the formatting bar row. */
  linkInBar: boolean;
  /** The link at the cursor shows in a popover at the link; the link field opens there too. */
  linkPopover: boolean;
};

type Placement = Pick<Prefs, "formatBar" | "linkDetails" | "saveButtons" | "saveStatus">;

/** Without the formatting bar row, what would go in it moves: save buttons and status to the toolbar, links to the popover. */
export function editorLayout(p: Placement): EditorLayout {
  const barRow = p.formatBar === "toolbar" || p.formatBar === "both";
  return {
    barRow,
    floating: p.formatBar === "floating" || p.formatBar === "both",
    actionsInBar: barRow && p.saveButtons === "bar",
    status: p.saveStatus === "bar" && !barRow ? "toolbar" : p.saveStatus,
    linkInBar: barRow && p.linkDetails !== "popover",
    linkPopover: !barRow || p.linkDetails !== "bar",
  };
}
