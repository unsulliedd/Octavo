// Find in document: matching and DOM ranges. The find bar paints the ranges with the CSS Custom Highlight API,
// so the rendered document is never rewritten.

/** A match in a list of text pieces: piece index and offset of its start and (exclusive) end. */
export type Match = { start: [piece: number, offset: number]; end: [piece: number, offset: number] };

/** Separates pieces that belong to different blocks, so a match can't run from one paragraph into the next. */
const BREAK = "\u0000";

/**
 * Lower case with the same length as `s`, so offsets in the result are offsets in `s`.
 * Characters whose lower case is longer keep its first unit: "İ" becomes "i".
 */
export function fold(s: string) {
  const lower = s.toLowerCase();
  if (lower.length === s.length) return lower;
  let out = "";
  for (const ch of s) {
    const l = ch.toLowerCase();
    out += l.length === ch.length ? l : ch.length === 1 ? l[0] : ch;
  }
  return out;
}

/** Pattern for `query`, to run on folded text; any run of whitespace in it matches any run of whitespace. */
export function queryPattern(query: string) {
  const words = fold(query.split(BREAK).join("")).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return undefined;
  return new RegExp(words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+"), "gu");
}

/**
 * Finds `query` in `pieces`, ignoring case. `pieces` are the document's text nodes in order. A match may span pieces (text split by
 * inline formatting) but not a piece whose index is in `breaks` (the first text of a new block).
 */
export function findMatches(pieces: string[], query: string, breaks: ReadonlySet<number> = new Set()): Match[] {
  const pattern = queryPattern(query);
  if (!pattern) return [];
  const starts: number[] = [];
  let text = "";
  pieces.forEach((piece, i) => {
    if (i > 0 && breaks.has(i)) text += BREAK;
    starts.push(text.length);
    text += piece;
  });
  // The piece holding character `c`: the last one starting at or before it (empty pieces share a start with the next).
  const pieceAt = (c: number) => {
    let lo = 0;
    let hi = pieces.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= c) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
  return [...fold(text).matchAll(pattern)].map((m): Match => {
    const first = pieceAt(m.index);
    const last = pieceAt(m.index + m[0].length - 1);
    return { start: [first, m.index - starts[first]], end: [last, m.index + m[0].length - starts[last]] };
  });
}

/** Index after stepping `step` from `current` through `count` matches, wrapping around at both ends. */
export function stepIndex(current: number, step: number, count: number) {
  return count ? (((current + step) % count) + count) % count : -1;
}

/** The first match at or below `top` (for example the top of the visible area), or the first match. */
export function firstVisible(matchTops: number[], top: number) {
  const i = matchTops.findIndex((t) => t >= top);
  return matchTops.length ? Math.max(i, 0) : -1;
}

/** "2 of 7", "No results", or nothing before anything is typed. */
export function matchLabel(index: number, count: number, query: string) {
  if (!query.trim()) return "";
  return count ? `${index + 1} of ${count}` : "No results";
}

/** Elements whose text is never searched: hidden MathML copies of formulas, code block headers, diagrams. */
const SKIP = ".katex-mathml, .code-head, svg, style, script";
const BLOCK = "p, li, td, th, h1, h2, h3, h4, h5, h6, pre, blockquote, dt, dd, figcaption, caption, summary, div";

/** The searchable text nodes under `root`, in document order, and the indexes that start a new block. */
export function textPieces(root: Element) {
  const nodes: Text[] = [];
  const breaks = new Set<number>();
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => (node.parentElement?.closest(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  let lastBlock: Element | null = null;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const block = node.parentElement?.closest(BLOCK) ?? null;
    if (block !== lastBlock) breaks.add(nodes.length);
    lastBlock = block;
    nodes.push(node as Text);
  }
  return { nodes, breaks };
}

/** DOM ranges for every match of `query` under `root`. */
export function findRanges(root: Element, query: string) {
  const { nodes, breaks } = textPieces(root);
  return findMatches(
    nodes.map((n) => n.data),
    query,
    breaks,
  ).map(({ start, end }) => {
    const range = root.ownerDocument.createRange();
    range.setStart(nodes[start[0]], start[1]);
    range.setEnd(nodes[end[0]], end[1]);
    return range;
  });
}
