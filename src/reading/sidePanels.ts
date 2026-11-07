import { MIN_SIDEBAR } from "@/ui/sidebarWidth";

// Which side panels show, and the dashes drawn for a hidden outline.

/** One heading's dash: `index` is the heading's place in the document's outline. */
export type Dash = { w: number; active: boolean; index: number; text: string };

/** The width of the column of dashes, and its distance from the text. */
export const RAIL_WIDTH = 22;
export const RAIL_GAP = 16;

/**
 * Where the column of dashes starts. It sits in the margin just past the text on the right, or just before it on the left,
 * when that margin has room inside `bounds` (the document's edges, less its scrollbar). Otherwise, and with no text
 * column to sit beside, it goes against that edge of the document, never over the text or the sidebar.
 */
export function railPlace(side: "left" | "right", textEdge: number | undefined, bounds: { left: number; right: number }) {
  if (side === "right") {
    const x = textEdge === undefined ? undefined : textEdge + RAIL_GAP;
    return x !== undefined && x + RAIL_WIDTH <= bounds.right ? { x, margin: true } : { x: bounds.right - RAIL_WIDTH, margin: false };
  }
  const x = textEdge === undefined ? undefined : textEdge - RAIL_GAP - RAIL_WIDTH;
  return x !== undefined && x >= bounds.left ? { x, margin: true } : { x: bounds.left, margin: false };
}

/** The space between the dashes and the floating panel. */
export const PANEL_GAP = 6;

/**
 * How the outline floats from the dashes at `x`, given the width `wanted`: outward, away from the text, so the left
 * dashes open it leftward and the right dashes rightward, shrunk to the free space between the dashes and the edge of
 * `bounds` (the document's edges, less its scrollbar). When that space is narrower than the sidebar's smallest width
 * it opens toward the text instead, at the wanted width.
 */
export function panelPlace(side: "left" | "right", x: number, wanted: number, bounds: { left: number; right: number }): { opens: "left" | "right"; width: number } {
  const free = side === "left" ? x - PANEL_GAP - bounds.left : bounds.right - (x + RAIL_WIDTH + PANEL_GAP);
  const width = Math.min(wanted, free);
  return width >= MIN_SIDEBAR ? { opens: side, width } : { opens: side === "left" ? "right" : "left", width: wanted };
}

/** Dashes shown at most. */
export const HEADING_DASHES = 40;

/** The `cap` items around the one at `at`, in order; the first `cap` when `at` is -1. */
function around<T>(items: T[], at: number, cap: number) {
  if (items.length <= cap) return items;
  const start = Math.min(Math.max(at - Math.floor(cap / 2), 0), items.length - cap);
  return items.slice(start, start + cap);
}

/** One dash per heading, shorter for lower levels. Limitation: a document with more headings than the cap shows the ones around the current heading. */
export function outlineDashes(headings: { id: string; level: number; text: string }[], activeId?: string): Dash[] {
  const dashes = headings.map((h, index) => ({ w: Math.max(4, 16 - h.level * 3), active: h.id === activeId, index, text: h.text }));
  return around(dashes, headings.findIndex((h) => h.id === activeId), HEADING_DASHES);
}
