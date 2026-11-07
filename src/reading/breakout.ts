// Tables and code blocks wider than the text column grow into the space beside it, up to the reading
// area's edges, instead of scrolling sideways inside the column.

/** Space kept between a widened block and the reading area's edge. */
export const EDGE = 24;

/**
 * Where a block of `natural` width goes, given the column width and the free space to its left and right.
 * Undefined when it fits the column. Otherwise its width (at most the column plus both sides) and how
 * far it reaches left of the column: half its overflow, moved over when one side has less room.
 */
export function breakout(natural: number, column: number, left: number, right: number) {
  if (natural <= column + 1) return undefined;
  const width = Math.min(natural, column + Math.max(0, left) + Math.max(0, right));
  const extra = width - column;
  if (extra < 1) return undefined;
  const reach = Math.min(Math.max(0, left), Math.max(extra / 2, extra - Math.max(0, right)));
  return { width: Math.round(width), reach: Math.round(reach) };
}

/**
 * Widens the tables and code blocks of `root` (the text column) that don't fit it, within `area`, or
 * returns them to the column's width when `enabled` is false. All blocks are measured together, so a
 * long document lays out a few times, not once per block.
 */
export function widenBlocks(root: HTMLElement, area: HTMLElement, enabled = true) {
  const blocks = [...root.querySelectorAll<HTMLElement>(":scope > .table-scroll, :scope > .code-block")];
  if (!enabled) {
    for (const el of blocks) el.style.width = el.style.marginLeft = "";
    return;
  }
  // A table at its natural width shows every cell without wrapping (a resized table is as wide as its
  // columns); a code block's lines are as wide as its code.
  const autoTables = blocks.map((el) => el.querySelector<HTMLElement>(":scope > table:not(.sized)"));
  for (const el of blocks) el.style.width = el.style.marginLeft = "";
  for (const table of autoTables) if (table) table.style.width = "max-content";
  const natural = blocks.map((el) => {
    const table = el.querySelector<HTMLElement>(":scope > table");
    if (table) return table.offsetWidth;
    const pre = el.querySelector("pre");
    return pre ? pre.scrollWidth + (el.offsetWidth - pre.clientWidth) : el.scrollWidth;
  });
  for (const table of autoTables) if (table) table.style.width = "";
  const column = root.clientWidth;
  const box = root.getBoundingClientRect();
  const frame = area.getBoundingClientRect();
  const left = box.left - frame.left - EDGE;
  const right = frame.left + area.clientWidth - box.right - EDGE;
  blocks.forEach((el, i) => {
    const place = breakout(natural[i], column, left, right);
    if (!place) return;
    el.style.width = `${place.width}px`;
    el.style.marginLeft = `${-place.reach}px`;
  });
}
