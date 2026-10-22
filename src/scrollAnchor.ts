// Keeps the reading position when the same document is shown in another view (reading ↔ editing),
// whose blocks have slightly different heights. The anchor is the last heading at or above the top
// of the view and how far below it the view is.

export type Anchor = { heading: number; offset: number } | { fraction: number };

/**
 * `headingTops` are the headings' positions in scroll coordinates (top of the content = 0), in order;
 * `scrollTop` and `scrollHeight` describe the view.
 */
export function anchorAt(headingTops: number[], scrollTop: number, scrollHeight: number): Anchor {
  let heading = -1;
  for (let i = 0; i < headingTops.length && headingTops[i] <= scrollTop + 1; i++) heading = i;
  if (heading < 0) return { fraction: scrollHeight > 0 ? scrollTop / scrollHeight : 0 };
  return { heading, offset: scrollTop - headingTops[heading] };
}

/** The scroll position in the other view for `anchor`, given that view's headings and height. */
export function scrollTopFor(anchor: Anchor, headingTops: number[], scrollHeight: number): number {
  if ("fraction" in anchor) return Math.round(anchor.fraction * scrollHeight);
  const top = headingTops[Math.min(anchor.heading, headingTops.length - 1)];
  return top === undefined ? 0 : Math.max(0, Math.round(top + anchor.offset));
}
